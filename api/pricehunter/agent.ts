/**
 * Агент поиска по формуле 2+1+1 (price-comparison skill v7.4):
 * Цена 1 и Цена 2 оригинала (разные поставщики), аналог другой марки,
 * аналог той же марки. Graceful fallback — как в skill.
 */
import { webSearch, fetchText, domainOf, looksLikeProductPage } from "./search";
import {
  extractPrice,
  extractBrand,
  typeKeywords,
  extractParams,
} from "./extract";
import type {
  ItemResult,
  PriceOffer,
  AnalogBlock,
  MatrixRow,
  EvalIssue,
} from "./types";

/** Мягкие бюджеты времени на этап (мс) — веб-версия лимитов 10/10/5/10 мин */
const BUDGET = { price1: 60_000, price2: 60_000, analogOther: 30_000, analogSame: 45_000 };

function expired(start: number, budget: number) {
  return Date.now() - start > budget;
}

function relevance(hitTitle: string, name: string): number {
  const tokens = name
    .toLowerCase()
    .split(/[^a-zа-я0-9ё-]+/i)
    .filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const t = hitTitle.toLowerCase();
  const hit = tokens.filter((x) => t.includes(x)).length;
  return hit / tokens.length;
}

async function offerFromUrl(url: string): Promise<PriceOffer | null> {
  const html = await fetchText(url);
  if (!html || html.length < 500) return null;
  const info = extractPrice(html);
  return {
    price: info.price, // может быть null → «Цена не указана»
    url,
    supplier: domainOf(url),
    title: info.title || url,
  };
}

/** Ищем цену оригинала; excludeDomains — чтобы цена 2 была с другого сайта */
async function findOriginalPrice(
  name: string,
  excludeDomains: Set<string>,
  budget: number,
): Promise<PriceOffer | null> {
  const start = Date.now();
  const queries = [
    `${name} купить цена`,
    `${name.split("\n")[0]} цена`,
  ];
  for (const q of queries) {
    if (expired(start, budget)) break;
    const hits = await webSearch(q, 8);
    const ranked = hits
      .filter((h) => !excludeDomains.has(domainOf(h.url)))
      .map((h) => ({ h, rel: relevance(h.title, name) }))
      .sort((a, b) => b.rel - a.rel);
    for (const { h, rel } of ranked) {
      if (expired(start, budget)) break;
      if (rel < 0.25 && ranked.length > 2) continue;
      if (!looksLikeProductPage(h.url)) continue;
      const offer = await offerFromUrl(h.url);
      if (offer && (offer.price !== null || rel > 0.4)) return offer;
    }
  }
  return null;
}

/** Аналог: другая марка (исключаем бренд) или та же марка (другая модель) */
async function findAnalog(
  name: string,
  kind: "other_brand" | "same_brand",
  excludeDomains: Set<string>,
  budget: number,
): Promise<AnalogBlock | null> {
  const start = Date.now();
  const brand = extractBrand(name);
  const type = typeKeywords(name, brand);
  if (!type) return null;

  const queries =
    kind === "other_brand"
      ? [
          `${type} аналог купить цена${brand ? ` -${brand}` : ""}`,
          `${type} купить цена${brand ? ` -${brand}` : ""}`,
        ]
      : brand
        ? [`${brand} ${type} купить цена`, `${brand} ${type.split(" ")[0]} цена`]
        : [];

  const originalTokens = new Set(
    name.toLowerCase().split(/[^a-zа-я0-9ё-]+/i).filter((t) => t.length > 3),
  );

  for (const q of queries) {
    if (expired(start, budget)) break;
    const hits = await webSearch(q, 8);
    for (const h of hits) {
      if (expired(start, budget)) break;
      if (excludeDomains.has(domainOf(h.url))) continue;
      if (!looksLikeProductPage(h.url)) continue;
      const tl = h.title.toLowerCase();
      if (kind === "other_brand") {
        if (brand && tl.includes(brand.toLowerCase())) continue;
      } else {
        if (!brand || !tl.includes(brand.toLowerCase())) continue;
        // та же марка, но другая модель: название не должно совпадать почти полностью
        const overlap = [...originalTokens].filter((t) => tl.includes(t)).length;
        if (overlap / Math.max(originalTokens.size, 1) > 0.8) continue;
      }
      const offer = await offerFromUrl(h.url);
      if (!offer) continue;
      const analogName = offer.title || h.title;
      const analogBrand =
        kind === "other_brand" ? extractBrand(analogName) || "Другая марка" : brand;
      return {
        kind,
        title: analogName.slice(0, 200),
        brand: analogBrand,
        offer,
        sources: [offer.url],
        matrix: buildMatrix(name, analogName, offer),
      };
    }
  }
  return null;
}

function buildMatrix(
  originalName: string,
  analogName: string,
  offer: PriceOffer,
): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const op = new Map(extractParams(originalName).map(([k, v]) => [k.toLowerCase(), v]));
  const ap = new Map(extractParams(analogName).map(([k, v]) => [k.toLowerCase(), v]));
  const keys = new Set([...op.keys(), ...ap.keys()]);
  for (const k of keys) {
    const o = op.get(k) ?? "—";
    const a = ap.get(k) ?? "—";
    rows.push({
      param: k,
      original: o,
      analog: a,
      deviation:
        o === "—" || a === "—" ? "unknown" : o === a ? "match" : "critical",
      note:
        o === "—" || a === "—"
          ? "Требует проверки по datasheet"
          : o === a
            ? "Совпадает"
            : "Отклонение — проверить критичность",
    });
  }
  if (!rows.length) {
    rows.push({
      param: "Параметры",
      original: "См. источник",
      analog: "См. источник",
      deviation: "unknown",
      note: "Не удалось извлечь параметры автоматически — проверьте по ссылкам",
    });
  }
  rows.unshift({
    param: "Цена",
    original: "см. сводную таблицу",
    analog: offer.price !== null ? `${offer.price} ₽` : "Цена не указана",
    deviation: "unknown",
    note: "",
  });
  return rows;
}

function evalItem(r: ItemResult): EvalIssue[] {
  const issues: EvalIssue[] = [];
  const p1 = r.price1?.price ?? null;
  const p2 = r.price2?.price ?? null;

  if (!r.price1) issues.push({ level: "fail", message: "Нет ни одной цены оригинала" });
  if (!r.comment.trim()) issues.push({ level: "fail", message: "Пустой комментарий" });
  if (r.price1 && r.price2 && r.price1.supplier === r.price2.supplier)
    issues.push({ level: "fail", message: "Одинаковые поставщики у Цены 1 и Цены 2" });
  if (p1 && p2 && Math.max(p1, p2) / Math.min(p1, p2) > 10)
    issues.push({ level: "fail", message: "Цены отличаются >10x — проверьте единицы измерения" });
  if (p1 && p2 && Math.max(p1, p2) / Math.min(p1, p2) > 3)
    issues.push({ level: "warn", message: "Цены отличаются >3x — нужна ручная проверка" });
  if (r.price1 && !r.price2)
    issues.push({ level: "warn", message: "Только 1 цена оригинала" });
  if (r.price1 && p1 === null)
    issues.push({ level: "warn", message: "Цена 1 не указана на сайте — уточнить у поставщика" });
  const analog = r.analogOther?.offer ?? null;
  if (analog && analog.price !== null && p1 !== null && analog.price > p1)
    issues.push({ level: "warn", message: "Аналог дороже оригинала — нет объяснения преимуществ" });
  if (r.analogOther && !r.analogOther.offer)
    issues.push({ level: "warn", message: "У аналога другой марки нет URL" });
  return issues;
}

function buildComment(r: ItemResult): { comment: string; recommendation: ItemResult["recommendation"] } {
  const p1 = r.price1?.price ?? null;
  const ap = r.analogOther?.offer?.price ?? null;
  if (!r.price1) {
    return {
      comment: "Не найдена за отведённое время. Рекомендуется ручной поиск или запрос КП у поставщиков.",
      recommendation: "none",
    };
  }
  const parts: string[] = [];
  let recommendation: ItemResult["recommendation"] = "none";
  if (p1 !== null && r.price2 && r.price2.price !== null) {
    const min = Math.min(p1, r.price2.price);
    const max = Math.max(p1, r.price2.price);
    const spread = Math.round(((max - min) / max) * 100);
    if (spread >= 5)
      parts.push(`Разброс цен оригинала ${spread}% — закупать у ${min === p1 ? r.price1!.supplier : r.price2!.supplier}.`);
  }
  if (r.analogOther?.offer) {
    if (ap !== null && p1 !== null && ap < p1) {
      const save = Math.round(((p1 - ap) / p1) * 100);
      const hasCritical = r.analogOther.matrix.some((m) => m.deviation === "critical");
      recommendation = hasCritical ? "test" : "approve";
      parts.push(
        `Согласовать аналог ${r.analogOther.brand} (другая марка). Экономия ${save}%.` +
          (hasCritical ? " Есть отклонения параметров — требуется тест." : ""),
      );
    } else if (ap !== null && p1 !== null) {
      parts.push(`Аналог ${r.analogOther.brand} дороже оригинала — остаёмся на оригинале.`);
      recommendation = "none";
    } else {
      parts.push(`Аналог ${r.analogOther.brand} найден, цена не указана — уточнить у поставщика.`);
      recommendation = "test";
    }
  } else if (!r.analogSame?.offer) {
    parts.push("Аналоги не найдены. Рекомендуется закупка оригинала.");
  }
  if (!r.price2) parts.push("Цена 2 не найдена за отведённое время — возможно, монополия или позиция снята с производства.");
  return { comment: parts.join(" ") || "Позиция оценена.", recommendation };
}

import { llmAvailable, processItemWithLlm } from "./llm";

export async function processItem(num: number, name: string): Promise<ItemResult> {
  // Приоритет: LLM-агент с веб-поиском (если задан KIMI_API_KEY)
  if (llmAvailable()) {
    const llmResult = await processItemWithLlm(num, name, 150_000).catch(() => null);
    if (llmResult && (llmResult.price1 || llmResult.analogOther)) {
      if (!llmResult.comment) llmResult.comment = "Позиция оценена.";
      llmResult.issues = evalItem(llmResult);
      if (llmResult.recommendation === "none") {
        const bc = buildComment(llmResult);
        llmResult.recommendation = bc.recommendation;
      }
      return llmResult;
    }
    // LLM не справился — fallback на прямой парсинг
  }

  const date = new Date().toISOString().slice(0, 10);
  const result: ItemResult = {
    num,
    name,
    price1: null,
    price2: null,
    analogOther: null,
    analogSame: null,
    recommendation: "none",
    comment: "",
    date,
    issues: [],
  };

  // Цена 1 (критично)
  result.price1 = await findOriginalPrice(name, new Set(), BUDGET.price1);
  if (result.price1 && result.price1.price === null) {
    result.price1.notFound = false; // товар есть, цены нет
  }

  // Цена 2 (другой поставщик)
  const used = new Set<string>();
  if (result.price1) used.add(result.price1.supplier);
  result.price2 = await findOriginalPrice(name, used, BUDGET.price2);
  if (result.price2) used.add(result.price2.supplier);

  // Аналог другой марки
  result.analogOther = await findAnalog(name, "other_brand", used, BUDGET.analogOther);
  if (result.analogOther?.offer) used.add(result.analogOther.offer.supplier);

  // Аналог той же марки
  result.analogSame = await findAnalog(name, "same_brand", used, BUDGET.analogSame);

  const { comment, recommendation } = buildComment(result);
  result.comment = comment;
  result.recommendation = recommendation;
  result.issues = evalItem(result);
  return result;
}
