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

// ── Income money: one column set for every income view ──────────────────────
// Owner's definition: delivery fees and VAT are NOT income. What really goes
// into her pocket is the order amount WITHOUT delivery and BEFORE VAT. Delivery
// and VAT are still shown (before and with VAT) so she knows how much they are.
//   pocket + shippingNet + vat = grossTotal   (what customers paid)

export interface IncomeMoney {
  /** נכנס לכיס — without delivery, before VAT. */
  pocket: number;
  /** Without delivery, VAT included — products as the customer paid them. */
  pocketGross: number;
  shippingNet: number;
  shippingGross: number;
  /** All VAT in the amount (products + delivery). */
  vat: number;
  /** What customers were charged, VAT included. */
  grossTotal: number;
  /** Still unpaid (whole order amount). */
  openNet: number;
  openGross: number;
}

export type IncomeMoneyKey = keyof IncomeMoney;

export const INCOME_COLUMNS: { key: IncomeMoneyKey; label: string; short: string }[] = [
  { key: 'pocket',        label: 'נכנס לכיס — ללא משלוח, לפני מע״מ',  short: 'ללא משלוח לפני מע״מ (לכיס)' },
  { key: 'pocketGross',   label: 'ללא משלוח — כולל מע״מ',             short: 'ללא משלוח כולל מע״מ' },
  { key: 'shippingNet',   label: 'דמי משלוח — לפני מע״מ',             short: 'משלוח לפני מע״מ' },
  { key: 'shippingGross', label: 'דמי משלוח — כולל מע״מ',             short: 'משלוח כולל מע״מ' },
  { key: 'vat',           label: 'מע״מ',                              short: 'מע״מ' },
  { key: 'grossTotal',    label: 'סה״כ שהלקוחות שילמו — כולל מע״מ',   short: 'סה״כ כולל מע״מ' },
  { key: 'openNet',       label: 'טרם שולם — לפני מע״מ',              short: 'טרם שולם לפני מע״מ' },
  { key: 'openGross',     label: 'טרם שולם — כולל מע״מ',              short: 'טרם שולם כולל מע״מ' },
];

export const incomeValues = (m: IncomeMoney): number[] => INCOME_COLUMNS.map(c => m[c.key]);

export function emptyIncome(): IncomeMoney {
  return { pocket: 0, pocketGross: 0, shippingNet: 0, shippingGross: 0, vat: 0, grossTotal: 0, openNet: 0, openGross: 0 };
}

/** One order's income figures (barter orders carry no money). */
export function orderIncome(o: FinanceOrder): IncomeMoney {
  if (o.barter) return emptyIncome();
  return {
    pocket: o.netNoShipping,
    pocketGross: o.grossNoShipping,
    shippingNet: o.netShipping,
    shippingGross: o.grossShipping,
    vat: round2(o.grossTotal - o.netTotal),
    grossTotal: o.grossTotal,
    openNet: o.paid ? 0 : o.netTotal,
    openGross: o.paid ? 0 : o.grossTotal,
  };
}

function addIncome(acc: IncomeMoney, o: FinanceOrder) {
  const m = orderIncome(o);
  for (const c of INCOME_COLUMNS) acc[c.key] = round2(acc[c.key] + m[c.key]);
}

export interface MoneySummary extends IncomeMoney {
  count: number;
  openCount: number;
  barterCount: number;
  /** Barter value before VAT, without delivery (not counted anywhere). */
  barterTotal: number;
}

/** Sums orders. Barter orders are counted separately and NOT in the money. */
export function summarize(orders: FinanceOrder[]): MoneySummary {
  const s: MoneySummary = { ...emptyIncome(), count: 0, openCount: 0, barterCount: 0, barterTotal: 0 };
  for (const o of orders) {
    if (o.barter) {
      s.barterCount++;
      s.barterTotal = round2(s.barterTotal + o.netNoShipping);
      continue;
    }
    s.count++;
    if (!o.paid) s.openCount++;
    addIncome(s, o);
  }
  return s;
}

export interface CustomerSummary extends IncomeMoney {
  customerId: string;
  customerName: string;
  count: number;
}

/** Per-customer income (barter excluded), largest "pocket" first. */
export function summarizeByCustomer(orders: FinanceOrder[]): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();
  for (const o of orders) {
    if (o.barter) continue;
    const key = o.customerId ?? `name:${o.customerName}`;
    const cur = map.get(key) ?? { ...emptyIncome(), customerId: key, customerName: o.customerName, count: 0 };
    cur.count++;
    addIncome(cur, o);
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.pocket - a.pocket);
}

export interface PaymentMethodSummary extends IncomeMoney {
  method: string;
  count: number;
}

export const paymentMethodLabel = (m: string | null | undefined) => (m ?? '').trim() || 'לא צוין';

/** Per-payment-method income (barter excluded). */
export function summarizeByPaymentMethod(orders: FinanceOrder[]): PaymentMethodSummary[] {
  const map = new Map<string, PaymentMethodSummary>();
  for (const o of orders) {
    if (o.barter) continue;
    const k = paymentMethodLabel(o.paymentMethod);
    const cur = map.get(k) ?? { ...emptyIncome(), method: k, count: 0 };
    cur.count++;
    addIncome(cur, o);
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.pocket - a.pocket);
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
  /** Payslip (migration 059): the employee and the pay month 'YYYY-MM'. */
  עובד_id?: string | null;
  חודש_שכר?: string | null;
}

/** Category every payslip (תלוש שכר) is filed under. */
export const SALARY_CATEGORY = 'משכורות ועובדים';


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

// ── Monthly average ─────────────────────────────────────────────────────────

export interface AverageBasis {
  /** Number of months to divide the year total by (0 = nothing to average). */
  months: number;
  /** true for a finished year (÷ 12); false while the year is still running. */
  final: boolean;
  /** Human label, e.g. "÷ 6 חודשים, מאי–אוקטובר". */
  label: string;
}

/**
 * Owner's rule for "ממוצע חודשי":
 *   • a finished calendar year → year total ÷ 12;
 *   • the current year → year total ÷ the months from the first month with
 *     activity up to the current month (inclusive). It grows each month and
 *     becomes ÷ 12 once the year is over.
 * @param activeMonthKeys "YYYY-MM" keys of months that have any activity.
 */
export function averageBasis(year: number, activeMonthKeys: string[], today = todayJerusalem()): AverageBasis {
  const currentYear = Number(today.slice(0, 4));
  if (year < currentYear) return { months: 12, final: true, label: '÷ 12 חודשים' };
  if (year > currentYear) return { months: 0, final: false, label: '' };
  const inYear = activeMonthKeys.filter(k => k.startsWith(`${year}-`)).sort();
  if (!inYear.length) return { months: 0, final: false, label: '' };
  const from = Number(inYear[0].slice(5, 7));
  const to = Number(today.slice(5, 7));
  const months = Math.max(1, to - from + 1);
  const range = from === to ? HEBREW_MONTHS[to - 1] : `${HEBREW_MONTHS[from - 1]}–${HEBREW_MONTHS[to - 1]}`;
  return { months, final: false, label: `÷ ${months} חודשים, ${range}` };
}

export const averageOf = (total: number, basis: AverageBasis) => (basis.months ? round2(total / basis.months) : 0);

// ── Profit & loss ───────────────────────────────────────────────────────────

export interface PnlMonth {
  key: string;
  month: string;
  income: number;        // into the pocket: without delivery, before VAT
  incomeGross: number;   // the same, with VAT
  open: number;          // net of VAT, not yet paid
  expenses: number;      // net of VAT
  expensesGross: number; // what was paid
  result: number;
  /** Running result from January; null for future months with no data. */
  cumulative: number | null;
  hasData: boolean;
}

export interface Pnl {
  months: PnlMonth[];
  totals: { income: number; incomeGross: number; open: number; expenses: number; expensesGross: number; result: number };
  /** Monthly averages (see averageBasis) — same divisor for every column. */
  average: AverageBasis;
  avg: { income: number; incomeGross: number; expenses: number; expensesGross: number; result: number; open: number };
  avgExpenses: number;
  avgIncome: number;
}

/** Monthly profit & loss for a year — the single source for screen and reports. */
export function buildPnl(orders: FinanceOrder[], expenses: Expense[], year: number, basis: DateBasis, today = todayJerusalem()): Pnl {
  const currentMonth = today.slice(0, 7);
  let running = 0;
  const months: PnlMonth[] = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(year, i);
    const s = summarize(orders.filter(o => orderBasisDate(o, basis)?.slice(0, 7) === key));
    const ex = expenses.filter(e => e.תאריך.slice(0, 7) === key);
    const exp = round2(ex.reduce((t, e) => t + expenseNet(e), 0));
    const expGross = round2(ex.reduce((t, e) => t + (Number(e.סכום) || 0), 0));
    const result = round2(s.pocket - exp);
    const hasData = s.count > 0 || ex.length > 0;
    const counts = key <= currentMonth || hasData;
    if (counts) running = round2(running + result);
    return {
      key, month: HEBREW_MONTHS[i], income: s.pocket, incomeGross: s.pocketGross, open: s.openNet,
      expenses: exp, expensesGross: expGross, result, cumulative: counts ? running : null, hasData,
    };
  });
  const sum = (f: (m: PnlMonth) => number) => round2(months.reduce((t, m) => t + f(m), 0));
  const totals = {
    income: sum(m => m.income), incomeGross: sum(m => m.incomeGross), open: sum(m => m.open),
    expenses: sum(m => m.expenses), expensesGross: sum(m => m.expensesGross), result: 0,
  };
  totals.result = round2(totals.income - totals.expenses);
  const average = averageBasis(year, months.filter(m => m.hasData).map(m => m.key), today);
  const avg = {
    income: averageOf(totals.income, average),
    incomeGross: averageOf(totals.incomeGross, average),
    expenses: averageOf(totals.expenses, average),
    expensesGross: averageOf(totals.expensesGross, average),
    result: averageOf(totals.result, average),
    open: averageOf(totals.open, average),
  };
  return {
    months,
    totals,
    average,
    avg,
    avgExpenses: avg.expenses,
    avgIncome: avg.income,
  };
}
