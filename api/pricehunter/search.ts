/** Поиск по открытым источникам: DuckDuckGo HTML + Bing как fallback.
 *  v2: rate limiting, retry с backoff, circuit breaker pattern.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Rate limiting: минимальный интервал между запросами к одному источнику (мс) */
const RATE_LIMIT_MS = 800;

/** Последнее время запроса к каждому домену */
const lastRequestTime = new Map<string, number>();

/** Circuit breaker: домены, которые временно не отвечают */
const circuitBroken = new Map<string, number>();
const CIRCUIT_TIMEOUT_MS = 60_000;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/** Плохие источники: агрегаторы без цен, соцсети и т.п. */
const BLOCKED_DOMAINS = [
  "youtube.com",
  "vk.com",
  "t.me",
  "telegram",
  "wikipedia.org",
  "facebook.com",
  "instagram.com",
  "duckduckgo.com",
  "bing.com",
  "google.",
  "yandex.ru/search",
];

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isBlocked(url: string): boolean {
  const d = domainOf(url);
  return !d || BLOCKED_DOMAINS.some((b) => d.includes(b) || url.includes(b));
}

/** Страница должна вести на товар, а не на главную/поиск */
export function looksLikeProductPage(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path === "/" || path === "") return false;
    if (/search|catalog\/?$|category\/?$|razdel\/?$/.test(path)) return false;
    if (u.searchParams.has("q") || u.searchParams.has("query")) return false;
    return /product|item|tovar|goods|catalog\/|shop\/|id\d|\d{3,}/.test(path);
  } catch {
    return false;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Rate-limited fetch с retry */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000,
  maxRetries = 2,
): Promise<Response | null> {
  const domain = domainOf(url);

  // Circuit breaker check
  const brokenUntil = circuitBroken.get(domain);
  if (brokenUntil && Date.now() < brokenUntil) {
    console.warn(`[search] circuit open for ${domain}, skipping`);
    return null;
  }

  // Rate limiting
  const last = lastRequestTime.get(domain) ?? 0;
  const wait = last + RATE_LIMIT_MS - Date.now();
  if (wait > 0) await sleep(wait);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      lastRequestTime.set(domain, Date.now());
      const resp = await fetch(url, {
        ...options,
        signal: ctrl.signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
          ...options.headers,
        },
        redirect: "follow",
      });

      if (resp.status === 429 || resp.status === 503) {
        // Rate limited или service unavailable — circuit breaker
        circuitBroken.set(domain, Date.now() + CIRCUIT_TIMEOUT_MS);
        console.warn(`[search] ${domain} returned ${resp.status}, circuit broken for ${CIRCUIT_TIMEOUT_MS}ms`);
        return null;
      }

      if (!resp.ok) {
        if (attempt < maxRetries) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return null;
      }
      return resp;
    } catch (e) {
      if (attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
      }
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const resp = await fetchWithRetry(url, {}, timeoutMs);
  if (!resp) return "";
  try {
    const buf = await resp.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (/charset=["']?windows-1251/i.test(text.slice(0, 2000))) {
      text = new TextDecoder("windows-1251").decode(buf);
    }
    return text;
  } catch {
    return "";
  }
}

async function ddgSearch(query: string, max: number): Promise<SearchHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=ru-ru`;
  const html = await fetchText(url, 10000);
  if (!html) return [];

  const hits: SearchHit[] = [];
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < max) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (isBlocked(url)) continue;
    hits.push({ title: stripTags(m[2]), url, snippet: "" });
  }
  return hits;
}

async function bingSearch(query: string, max: number): Promise<SearchHit[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ru&cc=ru`;
  const html = await fetchText(url, 10000);
  if (!html) return [];

  const hits: SearchHit[] = [];
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < max) {
    const url = m[1];
    if (isBlocked(url)) continue;
    hits.push({ title: stripTags(m[2]), url, snippet: "" });
  }
  return hits;
}

export async function webSearch(query: string, max = 8): Promise<SearchHit[]> {
  const [ddg, bing] = await Promise.allSettled([
    ddgSearch(query, max),
    bingSearch(query, max),
  ]);

  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  for (const r of [ddg, bing]) {
    if (r.status !== "fulfilled") continue;
    for (const h of r.value) {
      const key = h.url.split("#")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(h);
      if (hits.length >= max) return hits;
    }
  }
  return hits;
}
