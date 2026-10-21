// ============================================================================
// Morning (חשבונית ירוקה) → expenses sync. SERVER-ONLY (uses API credentials).
//
// Supplier invoices are recorded in Morning's expenses module; this pulls them
// through the Morning REST API and maps each one onto an "הוצאות" row.
//   POST api.morning.co/idp/v1/oauth/token
//        { grant_type, client_id, client_secret }        → { accessToken }
//   POST /expenses/search   { fromDate, toDate, page, pageSize }
//                           → { total, page, pageSize, pages, items: Expense[] }
// Morning expense fields used: id, date, amount (total incl. VAT), vat,
// number, description, currency, paymentType, supplier { name, taxId }.
//
// mapMorningExpense() is pure so it can be tested without the network.
// ============================================================================

import { round2 } from '@/lib/finance';

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';
// Morning retired /account/token (Oct 2026) — tokens now come from its OAuth endpoint.
const MORNING_TOKEN_URL = 'https://api.morning.co/idp/v1/oauth/token';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export const MORNING_SOURCE = 'מורנינג';
export const morningExternalId = (id: string) => `morning:${id}`;

export interface MorningExpense {
  id?: string;
  date?: string;
  amount?: number | string;
  vat?: number | string;
  number?: string | number;
  description?: string;
  currency?: string;
  paymentType?: number | string;
  supplier?: { id?: string; name?: string; taxId?: string } | null;
}

/** Morning PaymentType → the CRM payment-method labels. */
const PAYMENT_TYPES: Record<string, string> = {
  '1': 'מזומן',
  '2': 'המחאה',
  '3': 'כרטיס אשראי',
  '4': 'העברה בנקאית',
  '5': 'PayPal',
  '10': 'bit',
  '11': 'אחר',
};

export interface MappedExpense {
  תאריך: string;
  שם_ספק: string | null;
  קטגוריה: string;
  תיאור: string | null;
  סכום: number;
  מעמ: number;
  מספר_מסמך: string | null;
  אמצעי_תשלום: string | null;
  הערות: string | null;
  מקור: string;
  מזהה_חיצוני: string;
}

export type MapResult =
  | { ok: true; row: MappedExpense }
  | { ok: false; reason: 'no-id' | 'bad-date' | 'foreign-currency' | 'credit' | 'zero'; label: string };

/** Turns one Morning expense into an expense row, or explains why it is skipped. */
export function mapMorningExpense(e: MorningExpense, category: string): MapResult {
  const label = `${e.supplier?.name ?? 'ללא ספק'} ${e.number ? `#${e.number}` : ''} ${e.date ?? ''}`.trim();
  if (!e.id) return { ok: false, reason: 'no-id', label };
  const date = typeof e.date === 'string' ? e.date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'bad-date', label };
  if (e.currency && e.currency !== 'ILS') return { ok: false, reason: 'foreign-currency', label };
  const amount = round2(Number(e.amount) || 0);
  if (amount < 0) return { ok: false, reason: 'credit', label };
  if (amount === 0) return { ok: false, reason: 'zero', label };
  let vat = round2(Math.abs(Number(e.vat) || 0));
  if (vat > amount) vat = 0;
  const taxId = e.supplier?.taxId ? `ח.פ ספק: ${e.supplier.taxId}` : null;
  return {
    ok: true,
    row: {
      תאריך: date,
      שם_ספק: e.supplier?.name?.trim().slice(0, 200) || null,
      קטגוריה: category,
      תיאור: e.description?.trim().slice(0, 500) || null,
      סכום: amount,
      מעמ: vat,
      מספר_מסמך: e.number != null && String(e.number).trim() ? String(e.number).trim().slice(0, 100) : null,
      אמצעי_תשלום: e.paymentType != null ? PAYMENT_TYPES[String(e.paymentType)] ?? null : null,
      הערות: taxId,
      מקור: MORNING_SOURCE,
      מזהה_חיצוני: morningExternalId(e.id),
    },
  };
}

export class MorningConfigError extends Error {}
export class MorningApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function getToken(id: string, secret: string): Promise<string> {
  const res = await fetch(MORNING_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    cache: 'no-store',
  });
  if (!res.ok) throw new MorningApiError('auth', res.status);
  const data = await res.json().catch(() => ({}));
  if (!data?.accessToken) throw new MorningApiError('auth-no-token', res.status);
  return data.accessToken as string;
}

/** Fetches every Morning expense dated between fromDate and toDate (inclusive). */
export async function fetchMorningExpenses(fromDate: string, toDate: string): Promise<MorningExpense[]> {
  const id = process.env.MORNING_API_ID;
  const secret = process.env.MORNING_API_SECRET;
  if (!id || !secret) throw new MorningConfigError('missing-credentials');

  const token = await getToken(id, secret);
  const all: MorningExpense[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${MORNING_API_BASE}/expenses/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fromDate, toDate, page, pageSize: PAGE_SIZE }),
      cache: 'no-store',
    });
    if (!res.ok) throw new MorningApiError('search', res.status);
    const data = await res.json().catch(() => ({}));
    const items: MorningExpense[] = Array.isArray(data?.items) ? data.items : data?.items ? [data.items] : [];
    all.push(...items);
    const pages = Number(data?.pages) || 1;
    if (page >= pages || items.length === 0) break;
  }
  return all;
}
