// Order price-tier logic for the new-order screen (pure, unit-tested).

export type PriceEntry = { מוצר_id: string; price_type: string; מחיר: number; min_quantity: number | null };
export type EffectivePriceType = 'retail' | 'retail_quantity' | 'business_fixed' | 'business_quantity';

export function resolvePriceListEntry(
  priceList: PriceEntry[],
  productId: string,
  priceType: string,
  qty: number,
): PriceEntry | undefined {
  if (priceType === 'business_quantity' || priceType === 'retail_quantity') {
    const all = priceList
      .filter(pl => pl.מוצר_id === productId && pl.price_type === priceType)
      .sort((a, b) => (b.min_quantity ?? 0) - (a.min_quantity ?? 0));
    const matching = all.filter(pl => (pl.min_quantity ?? 0) <= qty);
    // Below every tier minimum: fall back to the lowest tier, i.e. the dearest
    // unit price, rather than leaving the item with no price at all.
    return matching[0] ?? all[all.length - 1];
  }
  return priceList.find(pl => pl.מוצר_id === productId && pl.price_type === priceType);
}

/**
 * Total quantity of one product across the whole order.
 *
 * A quantity price tier is a bracket on how much of a product the ORDER
 * holds, not on how much sits on any one line. Multi-recipient orders are
 * what make the difference visible: 30 boxes for 30 people are 30 lines of 1,
 * and pricing each line on its own quantity would drop the order out of the
 * bracket it actually qualifies for.
 */
export function totalQtyForProduct(items: { מוצר_id: string; כמות: number }[], productId: string): number {
  if (!productId) return 0;
  return items.reduce((sum, i) => (i.מוצר_id === productId ? sum + (Number(i.כמות) || 0) : sum), 0);
}

export function computeEffectivePriceType(
  custType: string | undefined,
  items: { מוצר_id: string; כמות: number }[],
  products: { id: string; קטגוריית_מוצר?: string | null }[],
  priceList: PriceEntry[],
): EffectivePriceType {
  if (custType === 'עסקי - כמות') return 'business_quantity';
  if (custType === 'עסקי - קבוע' || custType === 'עסקי') return 'business_fixed';

  // Private / recurring customers — check for event/quantity upgrade
  // Only count items with a product selected (מוצר_id not empty)
  const totalUnits = items.reduce((sum, it) => it.מוצר_id ? sum + (it.כמות || 0) : sum, 0);
  if (totalUnits >= 250) return 'retail_quantity';

  // Amount threshold at retail prices; only one cake item counts toward 2500
  let nonCakeTotal = 0;
  let maxCakeTotal = 0;
  for (const it of items) {
    if (!it.מוצר_id) continue;
    const retailEntry = priceList.find(pl => pl.מוצר_id === it.מוצר_id && pl.price_type === 'retail');
    if (!retailEntry) continue;
    const lineTotal = retailEntry.מחיר * (it.כמות || 0);
    const prod = products.find(p => p.id === it.מוצר_id);
    if (prod?.קטגוריית_מוצר === 'עוגה') {
      maxCakeTotal = Math.max(maxCakeTotal, lineTotal);
    } else {
      nonCakeTotal += lineTotal;
    }
  }
  if (nonCakeTotal + maxCakeTotal >= 2500) return 'retail_quantity';
  return 'retail';
}
