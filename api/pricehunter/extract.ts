/** Извлечение цены и метаданных со страницы товара. */

export interface PageInfo {
  price: number | null;
  title: string;
  currency: string;
}

const MIN_PRICE = 10;
const MAX_PRICE = 10_000_000;

function toNumber(s: string): number | null {
  const cleaned = s.replace(/[\s\u00A0\u2009']/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_PRICE || n > MAX_PRICE) return null;
  return Math.round(n * 100) / 100;
}

function fromJsonLd(html: string): number | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1]);
      const stack: unknown[] = [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        const obj = node as Record<string, unknown>;
        if (obj["@type"] === "Offer" || obj.offers) {
          const offer = (obj.offers ?? obj) as Record<string, unknown>;
          const p = offer.price ?? offer.lowPrice;
          if (p != null) {
            const n = toNumber(String(p));
            if (n) return n;
          }
        }
        for (const v of Object.values(obj)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      /* битый JSON-LD */
    }
  }
  return null;
}

function fromMeta(html: string): number | null {
  const patterns = [
    /property=["']product:price:amount["'][^>]+content=["']([\d.,\s]+)["']/i,
    /content=["']([\d.,\s]+)["'][^>]+property=["']product:price:amount["']/i,
    /property=["']og:price:amount["'][^>]+content=["']([\d.,\s]+)["']/i,
    /content=["']([\d.,\s]+)["'][^>]+property=["']og:price:amount["']/i,
    /itemprop=["']price["'][^>]+content=["']([\d.,\s]+)["']/i,
    /content=["']([\d.,\s]+)["'][^>]+itemprop=["']price["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const n = toNumber(m[1]);
      if (n) return n;
    }
  }
  return null;
}

function fromBody(html: string): number | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const candidates: number[] = [];
  const re = /(\d[\d\s\u00A0]{1,11}[.,]?\d{0,2})\s*(?:₽|руб(?:\.|лей|ля)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = toNumber(m[1]);
    if (n) candidates.push(n);
    if (candidates.length > 60) break;
  }
  if (!candidates.length) return null;
  // Мода — наиболее часто встречающаяся цена (обычно цена товара повторяется)
  const freq = new Map<number, number>();
  for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);
  let best = candidates[0];
  let bestFreq = 0;
  for (const [v, f] of freq) {
    if (f > bestFreq || (f === bestFreq && v < best)) {
      best = v;
      bestFreq = f;
    }
  }
  return best;
}

function extractTitle(html: string): string {
  const og = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1].trim().slice(0, 300);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t)
    return t[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  return "";
}

export function extractPrice(html: string): PageInfo {
  const price = fromJsonLd(html) ?? fromMeta(html) ?? fromBody(html);
  return { price, title: extractTitle(html), currency: "RUB" };
}

/** Токен, похожий на бренд: латиница капсом или Капитализированная */
export function extractBrand(name: string): string {
  const tokens = name.split(/[\s,;:()[\]/\\]+/).filter(Boolean);
  for (const t of tokens) {
    if (/^[A-ZА-Я][A-Za-zА-Яа-я0-9-]{2,20}$/.test(t) && /[A-Za-zА-Яа-я]/.test(t)) {
      // пропускаем служебные слова
      if (/^(для|тип|серия|артикул|цена|купить|шт|упак)$/i.test(t)) continue;
      return t;
    }
  }
  return "";
}

/** Ключевые слова типа товара (без бренда и артикула) */
export function typeKeywords(name: string, brand: string): string {
  return name
    .split(/[\n,;:()[\]/\\]+/)
    .join(" ")
    .split(/\s+/)
    .filter((t) => {
      if (brand && t.toLowerCase() === brand.toLowerCase()) return false;
      if (/^[A-Z0-9-]{6,}$/i.test(t) && /\d/.test(t)) return false; // артикул
      return /[A-Za-zА-Яа-я]/.test(t);
    })
    .slice(0, 6)
    .join(" ");
}

/** Извлечь ключевые параметры из названия (число+единица) */
export function extractParams(name: string): [string, string][] {
  const out: [string, string][] = [];
  const re =
    /(\d+(?:[.,]\d+)?)\s*(Гбит\/с|Мбит\/с|Вт|кВт|В|А|мм|см|м|км|кг|г|л|мл|нм|nm|dBm|дБ|порт(?:а|ов)?|волок(?:он|на)|жил[аы]?|ОМ\d|OM\d|OS\d)/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(name))) {
    const key = m[2].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([m[2], m[1]]);
  }
  return out.slice(0, 8);
}
