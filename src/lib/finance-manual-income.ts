// ============================================================================
// Manual income (הכנסות ידניות, migration 063) — client-safe helpers.
//
// Income that doesn't come from an order (workshop, stall, one-off sale…).
// Each row is turned into a FinanceOrder so every income view — the income
// tab, profit & loss and the full report — counts it with the same math as
// order income, with no special cases in src/lib/finance.ts.
// ============================================================================

import { round2, type FinanceOrder } from '@/lib/finance';

export interface ManualIncome {
  id: string;
  תאריך: string;
  שם_לקוח: string | null;
  קטגוריה: string;
  תיאור: string | null;
  /** Amount received, VAT included. */
  סכום: number;
  /** VAT inside סכום (0 = no VAT charged). */
  מעמ: number;
  מספר_מסמך: string | null;
  אמצעי_תשלום: string | null;
  שולם: boolean;
  הערות: string | null;
  תאריך_יצירה?: string;
}

/** FinanceOrder ids of manual income start with this (never a real order id). */
export const MANUAL_INCOME_PREFIX = 'manual:';

export const isManualIncomeOrder = (o: Pick<FinanceOrder, 'id'>) => o.id.startsWith(MANUAL_INCOME_PREFIX);

export const manualIncomeName = (m: Pick<ManualIncome, 'שם_לקוח' | 'קטגוריה'>) =>
  (m.שם_לקוח ?? '').trim() || m.קטגוריה || 'הכנסה ידנית';

export function manualIncomeToFinanceOrder(m: ManualIncome): FinanceOrder {
  const gross = round2(Number(m.סכום) || 0);
  const vat = Math.min(round2(Number(m.מעמ) || 0), gross);
  const net = round2(gross - vat);
  return {
    id: `${MANUAL_INCOME_PREFIX}${m.id}`,
    orderNumber: 'הכנסה ידנית',
    orderDate: m.תאריך,
    deliveryDate: m.תאריך,
    customerId: null,
    customerName: manualIncomeName(m),
    customerType: '',
    vatMode: vat > 0 ? 'included' : 'exempt',
    paymentStatus: m.שולם ? 'שולם' : 'טרם שולם',
    paymentMethod: m.אמצעי_תשלום,
    barter: false,
    grossTotal: gross,
    grossShipping: 0,
    grossNoShipping: gross,
    netTotal: net,
    netShipping: 0,
    netNoShipping: net,
    paid: m.שולם,
  };
}
