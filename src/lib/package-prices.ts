// Server-only: the price list (מחירון) is where the owner keeps package
// prices — rows named "מארז 12", "מארז 25 פטיפורים" etc., not linked to any
// product. The package table (מארזים) has its own מחיר_מארז, which went
// stale whenever only the price list was updated. These helpers make the
// active retail price-list row win, and keep it in step when a package price
// is edited from the products screen.
import type { SupabaseClient } from '@supabase/supabase-js';

/** "מארז 12" / "מארז 12 פטיפורים" → 12. Anything else (e.g. "מארז 4 מגנומים") → null. */
export function packageSizeFromPriceName(name: string | null | undefined): number | null {
  const m = /^\s*מארז\s+(\d+)\s*(פטיפורים)?\s*$/.exec(name ?? '');
  if (!m) return null;
  const size = Number(m[1]);
  return size > 0 ? size : null;
}

type PriceRow = { id: string; product_name_snapshot: string | null; מחיר: unknown };

async function packagePriceRows(supabase: SupabaseClient): Promise<{ id: string; size: number; price: number }[]> {
  const { data, error } = await supabase
    .from('מחירון')
    .select('id, product_name_snapshot, מחיר')
    .eq('פעיל', true)
    .eq('price_type', 'retail')
    .ilike('product_name_snapshot', 'מארז%');
  if (error) {
    console.error('[package-prices] load failed:', error.code);
    return [];
  }
  return ((data ?? []) as unknown as PriceRow[]).flatMap(r => {
    const size = packageSizeFromPriceName(r.product_name_snapshot);
    const price = Number(r.מחיר);
    return size && Number.isFinite(price) ? [{ id: r.id, size, price }] : [];
  });
}

/** Overrides each package's מחיר_מארז with the active price-list price for its size, when one exists. */
export async function withPriceListPackagePrices<T extends { גודל_מארז?: unknown; מחיר_מארז?: unknown }>(
  supabase: SupabaseClient,
  packages: T[],
): Promise<T[]> {
  const rows = await packagePriceRows(supabase);
  if (rows.length === 0) return packages;
  const bySize = new Map(rows.map(r => [r.size, r.price]));
  return packages.map(p => {
    const price = bySize.get(Number(p.גודל_מארז));
    return price === undefined ? p : { ...p, מחיר_מארז: price };
  });
}

/** After a package price edit, writes the same price to its price-list row(s) so the two never disagree. */
export async function syncPackagePriceToPriceList(supabase: SupabaseClient, size: number, price: number): Promise<void> {
  const ids = (await packagePriceRows(supabase)).filter(r => r.size === size && r.price !== price).map(r => r.id);
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('מחירון')
    .update({ מחיר: price, תאריך_עדכון: new Date().toISOString() })
    .in('id', ids);
  if (error) console.error('[package-prices] sync failed:', error.code, 'size', size);
}
