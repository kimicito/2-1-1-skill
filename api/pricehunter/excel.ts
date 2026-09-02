/** Сборка итогового Excel по формату price-comparison skill v7.4 */
import ExcelJS from "exceljs";
import type { ItemResult, AnalogBlock, JobSummary } from "./types";

const BLUE = "FF1F4E79";
const ZEBRA = "FFF2F6FB";
const GREEN = "FFC6EFCE";
const YELLOW = "FFFFEB9C";
const RED = "FFFFC7CE";
const GREEN_FONT = "FF006100";
const YELLOW_FONT = "FF9C6500";
const RED_FONT = "FF9C0006";

function headerStyle(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 28;
}

function priceCell(cell: ExcelJS.Cell, offer: { price: number | null; url: string; notFound?: boolean } | null, notFoundText: string) {
  if (!offer) {
    cell.value = notFoundText;
    cell.font = { italic: true, color: { argb: "FF808080" } };
    return;
  }
  if (offer.price === null) {
    cell.value = { text: "Цена не указана", hyperlink: offer.url };
    cell.font = { italic: true, underline: true, color: { argb: YELLOW_FONT } };
    return;
  }
  cell.value = { text: `${offer.price} ₽`, hyperlink: offer.url };
  cell.font = { underline: true, color: { argb: "FF0563C1" } };
}

function recStyle(cell: ExcelJS.Cell, rec: ItemResult["recommendation"]) {
  const map = {
    approve: { t: "Согласовать", fill: GREEN, font: GREEN_FONT },
    test: { t: "Требует теста", fill: YELLOW, font: YELLOW_FONT },
    reject: { t: "НЕ согласовывать", fill: RED, font: RED_FONT },
    none: { t: "Без замены", fill: ZEBRA, font: "FF404040" },
  } as const;
  const m = map[rec];
  cell.value = m.t;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: m.fill } };
  cell.font = { bold: true, color: { argb: m.font } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function analogSection(ws: ExcelJS.Worksheet, item: ItemResult, block: AnalogBlock, startRow: number): number {
  let r = startRow;
  const title = ws.getRow(r);
  ws.mergeCells(r, 1, r, 5);
  title.getCell(1).value = `№${item.num}: ${item.name.split("\n")[0].slice(0, 80)} → ${block.title.slice(0, 80)}`;
  title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  title.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  title.height = 22;
  r++;

  const src = ws.getRow(r);
  ws.mergeCells(r, 1, r, 5);
  const srcCell = src.getCell(1);
  const first = block.sources[0] ?? block.offer?.url ?? "";
  srcCell.value = first
    ? { text: `Источники: ${block.sources.join(" | ") || first}`, hyperlink: first }
    : "Источники: —";
  srcCell.font = { underline: !!first, color: { argb: "FF0563C1" } };
  r++;

  const head = ws.getRow(r);
  ["Параметр", "Оригинал", `Аналог: ${block.brand}`, "Отклонение", "Влияние"].forEach((h, i) => {
    head.getCell(i + 1).value = h;
  });
  headerStyle(head);
  r++;

  for (const row of block.matrix) {
    const line = ws.getRow(r);
    line.getCell(1).value = row.param;
    line.getCell(2).value = row.original;
    line.getCell(3).value = row.analog;
    const dev = line.getCell(4);
    if (row.deviation === "match") {
      dev.value = "✅ Совпадает";
      dev.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    } else if (row.deviation === "minor") {
      dev.value = "🟡 Незначительное";
      dev.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    } else if (row.deviation === "critical") {
      dev.value = "🔴 Критичное";
      dev.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    } else {
      dev.value = "❔ Проверить";
    }
    line.getCell(5).value = row.note;
    r++;
  }
  return r + 1;
}

export async function buildWorkbook(items: ItemResult[]): Promise<{ base64: string; summary: JobSummary }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PriceHunter";
  wb.created = new Date();

  // ── Вкладка 1: Сводная таблица
  const ws = wb.addWorksheet("Сводная таблица");
  ws.columns = [
    { width: 5 }, { width: 45 }, { width: 14 }, { width: 16 }, { width: 14 },
    { width: 16 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 16 },
    { width: 18 }, { width: 60 },
  ];
  const head = ws.getRow(1);
  ["№", "Наименование", "Цена 1 (₽)", "Магазин 1", "Цена 2 (₽)", "Магазин 2",
    "Аналог другой марки (₽)", "Магазин", "Аналог той же марки (₽)", "Магазин",
    "Рекомендация", "Комментарий"].forEach((h, i) => (head.getCell(i + 1).value = h));
  headerStyle(head);
  ws.views = [{ state: "frozen", ySplit: 1 }];

  items.forEach((it, idx) => {
    const row = ws.getRow(idx + 2);
    row.getCell(1).value = it.num;
    row.getCell(2).value = it.name;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    priceCell(row.getCell(3), it.price1, "Не найдена за 10 мин");
    row.getCell(4).value = it.price1?.supplier ?? "";
    priceCell(row.getCell(5), it.price2, "Не найдена за 10 мин");
    row.getCell(6).value = it.price2?.supplier ?? "";
    if (it.analogOther?.offer) {
      priceCell(row.getCell(7), it.analogOther.offer, "—");
      row.getCell(8).value = it.analogOther.offer.supplier;
    } else row.getCell(7).value = "—";
    if (it.analogSame?.offer) {
      priceCell(row.getCell(9), it.analogSame.offer, "—");
      row.getCell(10).value = it.analogSame.offer.supplier;
    } else row.getCell(9).value = "—";
    recStyle(row.getCell(11), it.recommendation);
    row.getCell(12).value = it.comment;
    row.getCell(12).alignment = { wrapText: true, vertical: "top" };
    if (idx % 2 === 1) {
      for (let c = 1; c <= 10; c++) {
        if (!row.getCell(c).fill || Object.keys(row.getCell(c).fill).length === 0)
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    }
  });

  // ── Вкладки 2 и 3: матрицы аналогов
  const wsOther = wb.addWorksheet("Аналоги другой марки");
  wsOther.columns = [{ width: 20 }, { width: 35 }, { width: 35 }, { width: 18 }, { width: 45 }];
  let r2 = 1;
  for (const it of items) {
    if (it.analogOther?.offer) r2 = analogSection(wsOther, it, it.analogOther, r2);
  }
  if (r2 === 1) wsOther.getRow(1).getCell(1).value = "Аналоги другой марки не найдены";

  const wsSame = wb.addWorksheet("Аналоги той же марки");
  wsSame.columns = [{ width: 20 }, { width: 35 }, { width: 35 }, { width: 18 }, { width: 45 }];
  let r3 = 1;
  for (const it of items) {
    if (it.analogSame?.offer) r3 = analogSection(wsSame, it, it.analogSame, r3);
  }
  if (r3 === 1) wsSame.getRow(1).getCell(1).value = "Аналоги той же марки не найдены";

  // ── Вкладка 4: Eval-отчёт
  const wsEval = wb.addWorksheet("Проверка качества");
  wsEval.columns = [{ width: 6 }, { width: 50 }, { width: 10 }, { width: 70 }];
  const eh = wsEval.getRow(1);
  ["№", "Позиция", "Уровень", "Проблема"].forEach((h, i) => (eh.getCell(i + 1).value = h));
  headerStyle(eh);
  let er = 2;
  let fails = 0;
  let warns = 0;
  for (const it of items) {
    for (const iss of it.issues) {
      const row = wsEval.getRow(er++);
      row.getCell(1).value = it.num;
      row.getCell(2).value = it.name.split("\n")[0].slice(0, 100);
      row.getCell(3).value = iss.level === "fail" ? "FAIL" : "WARN";
      row.getCell(3).fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: iss.level === "fail" ? RED : YELLOW },
      };
      row.getCell(4).value = iss.message;
      if (iss.level === "fail") fails++; else warns++;
    }
  }
  if (er === 2) wsEval.getRow(2).getCell(4).value = "Все проверки пройдены ✅";

  // Сводка
  const withTwoPrices = items.filter((i) => i.price1 && i.price2).length;
  const withAnalogs = items.filter((i) => i.analogOther?.offer || i.analogSame?.offer).length;
  let savings = 0;
  let comparable = 0;
  for (const it of items) {
    const p1 = it.price1?.price;
    const ap = it.analogOther?.offer?.price;
    if (p1 && ap && ap < p1) {
      savings += p1 - ap;
      comparable++;
    }
  }
  const summary: JobSummary = {
    totalItems: items.length,
    withTwoPrices,
    withAnalogs,
    potentialSavingsPct: null,
    potentialSavingsRub: savings > 0 ? Math.round(savings) : null,
    fails,
    warns,
  };
  void comparable;

  const buf = await wb.xlsx.writeBuffer();
  return { base64: Buffer.from(buf).toString("base64"), summary };
}
