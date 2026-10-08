// ============================================================================
// Finance (פיננסים) — shared, client-safe money math.
//
// Pure functions only (no server imports) so the API routes and the /finance
// page compute every figure the SAME way.
//
// How an order's stored amounts relate to real money (mirrors the Morning
// invoice function, supabase/functions/create-morning-invoice):
//   • סך_הכל_לתשלום = subtotal − discount + דמי_משלוח − זיכוי_בשימוש
//   • Business customer (עסקי / עסקי - קבוע / עסקי - כמות), non-Satmar,
//     not VAT-exempt → stored amounts are PRE-VAT; the customer actually pays
//     the stored total × 1.18.
//   • Everyone else (private, Satmar) → stored amounts already INCLUDE VAT.
//   • VAT-exempt customer (לקוח חו"ל) → no VAT at all; stored = paid = net.
// ============================================================================

export const VAT_RATE = 0.18;
export const BUSINESS_CUSTOMER_TYPES = new Set(['עסקי', 'עסקי - קבוע', 'עסקי - כמות']);

export type VatMode = 'business' | 'included' | 'exempt';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function vatModeFor(customerType: string | null | undefined, orderType: string | null | undefined, vatExempt: boolean | null | undefined): VatMode {
  if (vatExempt) return 'exempt';
  if (orderType !== 'סאטמר' && BUSINESS_CUSTOMER_TYPES.has(customerType ?? '')) return 'business';
  return 'included';
}

/** Raw order columns the finance views need. */
export interface FinanceOrderSource {
  id: string;
  מספר_הזמנה: string | null;
  תאריך_הזמנה: string | null;
  תאריך_אספקה: string | null;
  סטטוס_הזמנה: string | null;
  סטטוס_תשלום: string | null;
  סוג_הזמנה: string | null;
  אופן_תשלום: string | null;
  סך_הכל_לתשלום: number | string | null;
  דמי_משלוח: number | string | null;
  לקוח_id: string | null;
  לקוחות: {
    שם_פרטי: string | null;
    שם_משפחה: string | null;
    סוג_לקוח: string | null;
    פטור_ממעמ?: boolean | null;
  } | null;
}

/** One order, with every money figure already computed. */
export interface FinanceOrder {
  id: string;
  orderNumber: string;
  orderDate: string | null;
  deliveryDate: string | null;
  customerId: string | null;
  customerName: string;
  customerType: string;
  vatMode: VatMode;
  paymentStatus: string;
  paymentMethod: string | null;
  /** true = barter (בארטר) — no money changes hands, excluded from totals. */
  barter: boolean;
  /** Amount the customer actually pays, VAT included where charged. */
  grossTotal: number;
  grossShipping: number;
  grossNoShipping: number;
  /** Same amounts before VAT — real income for profit & loss. */
  netTotal: number;
  netShipping: number;
  netNoShipping: number;
  paid: boolean;
}

/** Order statuses that never count as income. */
const EXCLUDED_ORDER_STATUSES = new Set(['בוטלה', 'טיוטה']);

/** Should this order appear in the finance views at all? */
export function isCountableOrder(o: Pick<FinanceOrderSource, 'סטטוס_הזמנה' | 'סטטוס_תשלום'>): boolean {
  if (EXCLUDED_ORDER_STATUSES.has(o.סטטוס_הזמנה ?? '')) return false;
  if (o.סטטוס_תשלום === 'בוטל') return false;
  return true;
}

export function toFinanceOrder(r: FinanceOrderSource): FinanceOrder {
  const c = r.לקוחות;
  const mode = vatModeFor(c?.סוג_לקוח, r.סוג_הזמנה, c?.פטור_ממעמ);
  const total = Number(r.סך_הכל_לתשלום) || 0;
  // Shipping is part of the total and can't exceed it (credit may zero it).
  const shipping = Math.min(Math.max(0, Number(r.דמי_משלוח) || 0), total);

  const toGross = (n: number) => (mode === 'business' ? round2(n * (1 + VAT_RATE)) : round2(n));
  const toNet = (n: number) => (mode === 'included' ? round2(n / (1 + VAT_RATE)) : round2(n));

  const grossTotal = toGross(total);
  const grossShipping = toGross(shipping);
  const netTotal = toNet(total);
  const netShipping = toNet(shipping);

  return {
    id: r.id,
    orderNumber: r.מספר_הזמנה ?? '',
    orderDate: r.תאריך_הזמנה,
    deliveryDate: r.תאריך_אספקה,
    customerId: r.לקוח_id,
    customerName: c ? `${c.שם_פרטי ?? ''} ${c.שם_משפחה ?? ''}`.trim() || '—' : '—',
    customerType: c?.סוג_לקוח ?? '',
    vatMode: mode,
    paymentStatus: r.סטטוס_תשלום ?? '',
    paymentMethod: r.אופן_תשלום,
    barter: r.סטטוס_תשלום === 'בארטר',
    grossTotal,
    grossShipping,
    grossNoShipping: round2(grossTotal - grossShipping),
    netTotal,
    netShipping,
    netNoShipping: round2(netTotal - netShipping),
    paid: r.סטטוס_תשלום === 'שולם',
  };
}

export type DateBasis = 'order' | 'delivery';

export function orderBasisDate(o: FinanceOrder, basis: DateBasis): string | null {
  return basis === 'delivery' ? o.deliveryDate : o.orderDate;
}

export interface MoneySummary {
  count: number;
  noShipping: number;
  shipping: number;
  total: number;
  paidTotal: number;
  openTotal: number;
  openCount: number;
  netTotal: number;
  netNoShipping: number;
  barterCount: number;
  barterTotal: number;
}

export function emptySummary(): MoneySummary {
  return {
    count: 0, noShipping: 0, shipping: 0, total: 0, paidTotal: 0, openTotal: 0,
    openCount: 0, netTotal: 0, netNoShipping: 0, barterCount: 0, barterTotal: 0,
  };
}

/** Sums orders. Barter orders are counted separately and NOT in the money. */
export function summarize(orders: FinanceOrder[]): MoneySummary {
  const s = emptySummary();
  for (const o of orders) {
    if (o.barter) {
      s.barterCount++;
      s.barterTotal += o.grossTotal;
      continue;
    }
    s.count++;
    s.noShipping += o.grossNoShipping;
    s.shipping += o.grossShipping;
    s.total += o.grossTotal;
    s.netTotal += o.netTotal;
    s.netNoShipping += o.netNoShipping;
    if (o.paid) s.paidTotal += o.grossTotal;
    else { s.openTotal += o.grossTotal; s.openCount++; }
  }
  (Object.keys(s) as (keyof MoneySummary)[]).forEach(k => { s[k] = round2(s[k]); });
  return s;
}

export interface CustomerSummary {
  customerId: string;
  customerName: string;
  count: number;
  noShipping: number;
  shipping: number;
  total: number;
  openTotal: number;
}

export function summarizeByCustomer(orders: FinanceOrder[]): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();
  for (const o of orders) {
    if (o.barter) continue;
    const key = o.customerId ?? `name:${o.customerName}`;
    const cur = map.get(key) ?? {
      customerId: key, customerName: o.customerName, count: 0, noShipping: 0, shipping: 0, total: 0, openTotal: 0,
    };
    cur.count++;
    cur.noShipping = round2(cur.noShipping + o.grossNoShipping);
    cur.shipping = round2(cur.shipping + o.grossShipping);
    cur.total = round2(cur.total + o.grossTotal);
    if (!o.paid) cur.openTotal = round2(cur.openTotal + o.grossTotal);
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.noShipping - a.noShipping);
}

// ── Expenses ────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  תאריך: string;
  ספק_id: string | null;
  שם_ספק: string | null;
  קטגוריה: string;
  תיאור: string | null;
  סכום: number;
  מעמ: number;
  מספר_מסמך: string | null;
  אמצעי_תשלום: string | null;
  הערות: string | null;
  מקור: string | null;
  תאריך_יצירה?: string;
}


// Category names live in the managed list "expense_categories" (src/lib/option-lists.ts).
/** Categories that by nature carry no deductible VAT. */
export const NO_VAT_CATEGORIES = new Set(['משכורות ועובדים', 'ביטוחים', 'מיסים ואגרות', 'עמלות סליקה ובנק']);

/** VAT portion of an amount that already includes 18% VAT. */
export function vatFromGross(gross: number): number {
  return round2(gross - gross / (1 + VAT_RATE));
}

export const expenseNet = (e: Pick<Expense, 'סכום' | 'מעמ'>) => round2((Number(e.סכום) || 0) - (Number(e.מעמ) || 0));

export const expenseSupplierName = (e: Pick<Expense, 'שם_ספק'>) => (e.שם_ספק ?? '').trim() || 'ללא ספק';

// ── Months ──────────────────────────────────────────────────────────────────

export const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${HEBREW_MONTHS[m - 1]} ${y}`;
}

export function todayJerusalem(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
