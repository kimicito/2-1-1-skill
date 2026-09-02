/** Разбор входных данных: текст (по строкам) или Excel (xlsx/csv, base64). */
import * as XLSX from "xlsx";

const MAX_ITEMS_HARD = 100;
const HEADER_WORDS = /^(№|наименование|название|позиция|материал|товар|name|item)$/i;

export function parseTextItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length >= 3 && !HEADER_WORDS.test(l))
    .slice(0, MAX_ITEMS_HARD);
}

export function parseExcelItems(base64: string): string[] {
  const wb = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer" });
  const items: string[] = [];
  const seen = new Set<string>();
  for (const sheetName of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
    });
    for (const row of rows) {
      // Наименование — самая длинная текстовая ячейка строки
      let best = "";
      for (const cell of row) {
        const s = String(cell ?? "").trim();
        if (
          s.length > best.length &&
          /[A-Za-zА-Яа-яЁё]/.test(s) &&
          !/^\d+$/.test(s)
        )
          best = s;
      }
      if (best.length < 3 || best.length >= 500 || HEADER_WORDS.test(best)) continue;
      if (seen.has(best)) continue;
      seen.add(best);
      items.push(best);
      if (items.length >= MAX_ITEMS_HARD) return items;
    }
  }
  return items;
}
