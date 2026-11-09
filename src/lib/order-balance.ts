// How much is still owed on an order — shared by the order page, the orders
// list, the dashboard and the finance overview so they all agree.
//
// Paid = payment rows (תשלומים) marked שולם. A ממתין row is a payment link
// that was sent but not paid yet, so it doesn't count.
//
// Units: סך_הכל_לתשלום is stored before VAT for business customers (the screen
// adds 18% on top), while a payment is what the customer actually paid. So the
// balance is worked out on the amount the customer sees, then given back in
// the stored units so totals that add סך_הכל_לתשלום keep meaning the same.
import { VAT_RATE } from '@/lib/finance';

export interface PaymentLike { סכום?: number | string | null; סטטוס_תשלום?: string | null }

const BUSINESS_TYPES = new Set(['עסקי', 'עסקי - קבוע', 'עסקי - כמות']);

/** Same rule as the order page: business customer, not a סאטמר order. */
export function vatAddedOnTop(customerType: string | null | undefined, orderType: string | null | undefined): boolean {
  return orderType !== 'סאטמר' && BUSINESS_TYPES.has(customerType ?? '');
}

export function paidTotal(payments: PaymentLike[] | null | undefined): number {
  return +(payments ?? [])
    .filter(p => p.סטטוס_תשלום === 'שולם')
    .reduce((s, p) => s + (Number(p.סכום) || 0), 0)
    .toFixed(2);
}

/** What the customer still has to pay, in the amount she sees (VAT included where it's added). */
export function balanceShown(total: number, payments: PaymentLike[] | null | undefined, vatOnTop: boolean): number {
  const shown = vatOnTop ? total * (1 + VAT_RATE) : total;
  return +Math.max(0, shown - paidTotal(payments)).toFixed(2);
}

/** The same balance in stored units (before VAT for business customers). */
export function balanceStored(total: number, payments: PaymentLike[] | null | undefined, vatOnTop: boolean): number {
  const shown = balanceShown(total, payments, vatOnTop);
  return +(vatOnTop ? shown / (1 + VAT_RATE) : shown).toFixed(2);
}
