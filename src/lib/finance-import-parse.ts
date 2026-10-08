// Pure parsing helpers for importing expenses from a bookkeeping export
// (Excel / CSV). No DOM, no xlsx — the modal reads the file into a grid of
// cells and these functions turn cells into validated expense fields.

import { round2, vatFromGross } from '@/lib/finance';

export type RawCell = string | number | boolean | null | undefined;

export type FieldKey = 'date' | 'amount' | 'payee' | 'category' | 'description' | 'vat' | 'net' | 'docNumber';

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'תאריך',
  amount: 'סכום (כולל מע״מ)',
  payee: 'ספק / שם',
  category: 'קטגוריה / סעיף',
  description: 'תיאור / פרטים',
  vat: 'מע״מ',
  net: 'סכום לפני מע״מ',
  docNumber: 'מס׳ מסמך / אסמכתא',
};

// Header keywords, most specific first. Matching is substring-based on a
// normalised header ("סה\"כ כולל מע\"מ" → "סהכ כולל מעמ").
const KEYWORDS: Record<FieldKey, string[]> = {
  date: ['תאריך מסמך', 'תאריך ערך', 'תאריך', 'date'],
  amount: ['כולל מעמ', 'סהכ לתשלום', 'סהכ', 'סכום', 'חובה', 'total', 'amount'],
  payee: ['שם ספק', 'ספק', 'שם חשבון', 'שם הספק', 'לקוח/ספק', 'שם', 'supplier', 'vendor'],
  category: ['קטגוריה', 'סעיף', 'מיון', 'סוג הוצאה', 'category'],
  description: ['תיאור', 'פרטים', 'הערות', 'description', 'details'],
  vat: ['מעמ', 'vat'],
  net: ['לפני מעמ', 'ללא מעמ', 'נטו', 'net'],
  docNumber: ['מספר מסמך', 'מס מסמך', 'אסמכתא', 'מספר חשבונית', 'חשבונית', 'reference', 'invoice'],
};

export function normHeader(v: RawCell): string {
  return String(v ?? '').replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Index of the first row that looks like a header (≥2 recognised titles). */
export function detectHeaderRow(grid: RawCell[][]): number {
  const limit = Math.min(grid.length, 25);
  for (let i = 0; i < limit; i++) {
    const cells = grid[i].map(normHeader);
    let hits = 0;
    for (const f of ['date', 'amount', 'payee', 'description'] as FieldKey[]) {
      if (cells.some(c => c && KEYWORDS[f].some(k => c.includes(k)))) hits++;
    }
    if (hits >= 2) return i;
  }
  return 0;
}

/** Best-guess column for each field; -1 when not found. */
export function guessMapping(headers: RawCell[]): Record<FieldKey, number> {
  const h = headers.map(normHeader);
  const taken = new Set<number>();
  const result = {} as Record<FieldKey, number>;
  // Order matters: 'net' and 'vat' before 'amount' so "סכום לפני מע"מ" isn't taken as the gross.
  const order: FieldKey[] = ['date', 'net', 'vat', 'amount', 'docNumber', 'category', 'payee', 'description'];
  for (const f of order) {
    result[f] = -1;
    for (const kw of KEYWORDS[f]) {
      const idx = h.findIndex((c, i) => !taken.has(i) && c.includes(kw) && !(f === 'vat' && /לפני|ללא|כולל/.test(c)) && !(f === 'amount' && /לפני|ללא/.test(c)));
      if (idx >= 0) { result[f] = idx; taken.add(idx); break; }
    }
  }
  return result;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parses a date cell. Numbers are Excel serial dates; strings are read
 * day-first (Israeli format): 31/12/2026, 31.12.26, 31-12-2026, or ISO 2026-12-31.
 */
export function parseDateCell(v: RawCell): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const dt = new Date(Math.round((v - 25569) * 86400000));
    return validYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return validYmd(+m[3], +m[2], +m[1]);
  return null;
}

/**
 * Parses an amount cell: strips ₪ / commas / spaces, handles "(123)" and
 * trailing minus. Expenses are stored positive, so the sign is dropped.
 */
export function parseAmountCell(v: RawCell): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? round2(Math.abs(v)) : null;
  let s = String(v).trim().replace(/[₪\s]|ש"ח|ש״ח|NIS|ILS/gi, '').replace(/,/g, '');
  s = s.replace(/^\((.*)\)$/, '$1').replace(/^(.*)-$/, '$1');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return round2(Math.abs(Number(s)));
}

const cellText = (v: RawCell) => (v == null ? '' : String(v).trim());

export interface ImportOptions {
  mapping: Record<FieldKey, number>;
  defaultCategory: string;
  /** When there is no VAT/net column: true = amounts include 18% VAT. */
  assumeVatIncluded: boolean;
  /** Categories that never carry VAT (salaries etc.). */
  noVatCategories: Set<string>;
}

export interface ParsedExpenseRow {
  line: number;
  ok: boolean;
  error?: string;
  data?: {
    תאריך: string;
    שם_ספק: string | null;
    קטגוריה: string;
    תיאור: string | null;
    סכום: number;
    מעמ: number;
    מספר_מסמך: string | null;
  };
}

export function parseRows(dataRows: RawCell[][], firstLine: number, opts: ImportOptions): ParsedExpenseRow[] {
  const { mapping: mp } = opts;
  const get = (row: RawCell[], f: FieldKey) => (mp[f] >= 0 ? row[mp[f]] : null);
  const out: ParsedExpenseRow[] = [];

  dataRows.forEach((row, i) => {
    const line = firstLine + i;
    if (!row || row.every(c => cellText(c) === '')) return; // blank line

    const date = parseDateCell(get(row, 'date'));
    let amount = parseAmountCell(get(row, 'amount'));
    const vatCell = parseAmountCell(get(row, 'vat'));
    const netCell = parseAmountCell(get(row, 'net'));

    // Gross may be missing when the file only has net + VAT.
    if (amount == null && netCell != null) amount = round2(netCell + (vatCell ?? 0));

    if (!date) {
      out.push({ line, ok: false, error: 'תאריך חסר או לא תקין' });
      return;
    }
    if (amount == null || amount <= 0) {
      out.push({ line, ok: false, error: 'סכום חסר או אפס' });
      return;
    }

    const category = cellText(get(row, 'category')) || opts.defaultCategory;
    let vat: number;
    if (vatCell != null) vat = vatCell;
    else if (netCell != null) vat = round2(Math.max(0, amount - netCell));
    else if (opts.noVatCategories.has(category)) vat = 0;
    else vat = opts.assumeVatIncluded ? vatFromGross(amount) : 0;
    if (vat > amount) vat = 0;

    out.push({
      line,
      ok: true,
      data: {
        תאריך: date,
        שם_ספק: cellText(get(row, 'payee')) || null,
        קטגוריה: category.slice(0, 100),
        תיאור: cellText(get(row, 'description')).slice(0, 500) || null,
        סכום: amount,
        מעמ: vat,
        מספר_מסמך: cellText(get(row, 'docNumber')).slice(0, 100) || null,
      },
    });
  });
  return out;
}
