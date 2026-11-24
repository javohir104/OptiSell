import type { SalesRecord } from "../api/types";

export type CsvParseResult = { records: SalesRecord[]; errors: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses "date,quantity" rows (header optional, `,` or `;` separated).
 * Invalid rows are reported, never silently fixed or filled in.
 */
export const parseSalesCsv = (text: string): CsvParseResult => {
  const records: SalesRecord[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const [dateCell = "", qtyCell = ""] = line.split(/[;,\t]/).map((c) => c.trim());
    const lineNo = index + 1;

    if (index === 0 && !DATE_RE.test(dateCell)) return; // header row

    if (!DATE_RE.test(dateCell) || Number.isNaN(Date.parse(dateCell))) {
      errors.push(`${lineNo}-qator: sana noto'g'ri ("${dateCell}"), YYYY-MM-DD kerak.`);
      return;
    }
    const quantity = Number(qtyCell.replace(",", "."));
    if (qtyCell === "" || !Number.isFinite(quantity) || quantity < 0) {
      errors.push(`${lineNo}-qator: miqdor noto'g'ri ("${qtyCell}"), 0 yoki musbat son kerak.`);
      return;
    }
    records.push({ date: dateCell, quantity });
  });

  return { records, errors };
};

export const todayIso = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
