// Price entry with a chosen VAT basis on the new-order screen.
//
// The order keeps ONE stored convention for item prices, decided by the
// customer (see isBusiness in orders/new/page.tsx and the Morning invoice
// function): business customers store prices BEFORE VAT, everyone else stores
// the final price INCLUDING VAT. The user may still prefer to type a price on
// the other basis — these helpers translate between what is typed and what is
// stored, so everything downstream (totals, invoice, finance) is unchanged.

export const ORDER_VAT_RATE = 0.18;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Multiplier from the stored price to the price as the user types it.
 *   storedIncludesVat — the order stores gross prices (private customers)
 *   enterIncludesVat  — the user chose to type gross prices
 */
export function vatEntryFactor(storedIncludesVat: boolean, enterIncludesVat: boolean): number {
  if (storedIncludesVat === enterIncludesVat) return 1;
  return enterIncludesVat ? 1 + ORDER_VAT_RATE : 1 / (1 + ORDER_VAT_RATE);
}

/** Typed price → stored price (2 decimals, like the DB column). */
export function typedToStored(typed: number, factor: number): number {
  if (!Number.isFinite(typed)) return 0;
  return factor === 1 ? typed : round2(typed / factor);
}

/** Stored price → the value shown in the price field. */
export function storedToTyped(stored: number, factor: number): number {
  if (!Number.isFinite(stored)) return 0;
  return factor === 1 ? stored : round2(stored * factor);
}
