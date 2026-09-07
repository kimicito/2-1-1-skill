/**
 * LLM-агент на Kimi API (OpenAI-совместимый) со встроенным веб-поиском $web_search.
 * Активируется, если задан KIMI_API_KEY в переменных окружения сервера.
 * Без ключа движок работает в режиме прямого парсинга (fallback).
 */
import type { ItemResult, PriceOffer, MatrixRow } from "./types";
import { extractSKU } from "./extract";

const API_URL = () => process.env.KIMI_API_URL ?? "https://api.moonshot.cn/v1/chat/completions";
const MODEL = () => process.env.KIMI_MODEL ?? "kimi-k2-0905-preview";
const API_KEY = () => process.env.KIMI_API_KEY ?? "";

export function llmAvailable(): boolean {
  return API_KEY().length > 10;
}

interface LlmOffer {
  price: number | null;
  url: string;
  supplier: string;
  title: string;
}

interface LlmResult {
  price1: LlmOffer | null;
  price2: LlmOffer | null;
  analog_other_brand: (LlmOffer & { brand?: string; params_match?: string }) | null;
  analog_same_brand: (LlmOffer & { brand?: string; params_diff?: string }) | null;
  comment: string;
  sources?: string[];
}

const SYSTEM_PROMPT = `Ты — закупочный аналитик. Ищешь цены на российских B2B-площадках и маркетплейсах.

ФОРМАТ ВХОДНЫХ ДАННЫХ:
Позиция задана в формате: Описание//Артикул//Бренд
Пример: "Видеокамера 4Мп уличная...//DS-2CD2643G0-IZS//HIKVISION"

ИЩИ ПО АРТИКУЛУ (DS-2CD2643G0-IZS) — это точнее, чем по описанию!

По заданной позиции найди по формуле 2+1+1:
1. Цена 1 — оригинал у поставщика 1 (прямая ссылка на страницу товара!)
2. Цена 2 — оригинал у ДРУГОГО поставщика
3. Аналог ДРУГОЙ марки (не тот же бренд!)
4. Аналог ТОЙ ЖЕ марки (другая модель)

ПРАВИЛА:
- Ищи по АРТИКУЛУ, а не по полному описанию
- URL — только прямые страницы товаров, НЕ главные, НЕ поиск, НЕ категории
- Цены в рублях, числом
- Если товар есть, но цена не указана — price: null
- Если не нашёл — null в соответствующем поле
- Точность артикулов: C47-60 и C47-40 — разные позиции
- Цель — СНИЗИТЬ цену закупки

ВАЖНО: Не используй цены из примеров! Каждый запрос — реальный поиск.

Ответь СТРОГО одним JSON-объектом:
{
  "price1": {"price": ЧИСЛО_ИЛИ_NULL, "url": "https://РЕАЛЬНЫЙ_URL_ТОВАРА", "supplier": "домен.ru", "title": "Название товара"} | null,
  "price2": {...} | null,
  "analog_other_brand": {"price": ЧИСЛО_ИЛИ_NULL, "url": "...", "supplier": "...", "title": "...", "brand": "ДРУГАЯ_МАРКА", "params_match": "что совпадает"} | null,
  "analog_same_brand": {"price": ЧИСЛО_ИЛИ_NULL, "url": "...", "supplier": "...", "title": "...", "brand": "ТА_ЖЕ_МАРКА", "params_diff": "отличия"} | null,
  "comment": "Рекомендация + экономия в %",
  "sources": ["https://...datasheet"]
}`;

interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

async function chatOnce(messages: ChatMessage[], timeoutMs: number): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(API_URL(), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY()}`,
      },
      body: JSON.stringify({
        model: MODEL(),
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
        tools: [
          {
            type: "builtin_function",
            function: { name: "$web_search" },
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.warn(`[llm] Kimi API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      return null;
    }
    return (await resp.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn("[llm] request failed:", e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

function safeJson<T>(s: string): T | null {
  try {
    const m = s.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as T) : null;
  } catch {
    return null;
  }
}

function toOffer(o: LlmOffer | null | undefined): PriceOffer | null {
  if (!o || !o.url || !/^https?:\/\//.test(o.url)) return null;
  const price =
    typeof o.price === "number" && o.price >= 10 && o.price <= 10_000_000
      ? o.price
      : null;
  let supplier = o.supplier || "";
  try {
    supplier = new URL(o.url).hostname.replace(/^www\./, "");
  } catch { /* оставим как есть */ }
  return { price, url: o.url, supplier, title: (o.title || "").slice(0, 300) };
}

function matrixFromNote(param: string, original: string, analog: string, note: string): MatrixRow {
  return { param, original, analog, deviation: "unknown", note };
}

export async function processItemWithLlm(
  num: number,
  name: string,
  budgetMs: number,
): Promise<ItemResult | null> {
  const start = Date.now();
  const skuInfo = extractSKU(name);
  
  // Формируем запрос с акцентом на артикул
  const searchQuery = skuInfo.sku 
    ? `Артикул: ${skuInfo.sku} (${skuInfo.brand}). ${skuInfo.description}`
    : name;
    
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Позиция №${num}: ${searchQuery}` },
  ];

  let parsed: LlmResult | null = null;
  for (let iter = 0; iter < 5; iter++) {
    if (Date.now() - start > budgetMs) return null;
    const data = await chatOnce(messages, Math.min(120_000, budgetMs));
    if (!data) return null;
    const choice = (data.choices as Record<string, unknown>[] | undefined)?.[0];
    const msg = choice?.message as ChatMessage | undefined;
    if (!msg) return null;

    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls as { id: string; function?: { arguments?: string } }[]) {
        // $web_search исполняется на стороне сервера Kimi — контент игнорируется
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: "$web_search",
          content: tc.function?.arguments ?? "{}",
        });
      }
      continue;
    }
    if (typeof msg.content === "string") {
      parsed = safeJson<LlmResult>(msg.content);
    }
    break;
  }

  if (!parsed) return null;

  const result: ItemResult = {
    num,
    name,
    price1: toOffer(parsed.price1),
    price2: toOffer(parsed.price2),
    analogOther: null,
    analogSame: null,
    recommendation: "none",
    comment: (parsed.comment ?? "").slice(0, 1000),
    date: new Date().toISOString().slice(0, 10),
    issues: [],
  };

  // Цена 2 не должна быть с того же сайта
  if (result.price1 && result.price2 && result.price1.supplier === result.price2.supplier) {
    result.price2 = null;
  }

  if (parsed.analog_other_brand) {
    const offer = toOffer(parsed.analog_other_brand);
    if (offer) {
      result.analogOther = {
        kind: "other_brand",
        title: parsed.analog_other_brand.title || offer.title,
        brand: parsed.analog_other_brand.brand || "Другая марка",
        offer,
        sources: parsed.sources ?? [offer.url],
        matrix: [
          matrixFromNote("Цена", "см. сводную таблицу", offer.price !== null ? `${offer.price} ₽` : "не указана", ""),
          matrixFromNote("Параметры", "См. источник", "См. источник", parsed.analog_other_brand.params_match || "Проверить по datasheet"),
        ],
      };
    }
  }
  if (parsed.analog_same_brand) {
    const offer = toOffer(parsed.analog_same_brand);
    if (offer) {
      result.analogSame = {
        kind: "same_brand",
        title: parsed.analog_same_brand.title || offer.title,
        brand: parsed.analog_same_brand.brand || "",
        offer,
        sources: [offer.url],
        matrix: [
          matrixFromNote("Цена", "см. сводную таблицу", offer.price !== null ? `${offer.price} ₽` : "не указана", ""),
          matrixFromNote("Отличия", "См. источник", "См. источник", parsed.analog_same_brand.params_diff || "Проверить по datasheet"),
        ],
      };
    }
  }
  return result;
}
