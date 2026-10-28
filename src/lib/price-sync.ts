// Server-only: keeps the price list (מחירון) and the catalog in step.
//
// The same fact is stored in two places:
//   - a product's base price (מוצרים_למכירה.מחיר) and its regular retail row;
//   - a package's price (מארזים.מחיר_מארז) and the unlinked retail row named
//     "מארז 12" / "מארז 12 פטיפורים" (matched by size — sizes are unique);
//   - a product's name/sku and the copies on its price-list rows
//     (product_name_snapshot, sku).
// Whichever side is edited, these helpers write the change to the other side,
// so every screen reads the same value. They log and swallow their own errors:
// the edit itself already succeeded and must not be reported as failed.
import type { SupabaseClient } from '@supabase/supabase-js';

/** "מארז 12" / "מארז 12 פטיפורים" → 12. Anything else (e.g. "מארז 4 מגנומים") → null. */
export function packageSizeFromPriceName(name: string | null | undefined): number | null {
  const m = /^\s*מארז\s+(\d+)\s*(פטיפורים)?\s*$/.exec(name ?? '');
  if (!m) return null;
  const size = Number(m[1]);
  return size > 0 ? size : null;
}

type PriceRow = {
  id: string;
  מוצר_id: string | null;
  product_name_snapshot: string | null;
  price_type: string | null;
  מחיר: unknown;
  min_quantity: unknown;
  פעיל: boolean | null;
};

/** The one row per product/package that mirrors its base price: active, retail, no quantity tier. */
const isBaseRow = (r: PriceRow) => r.פעיל === true && r.price_type === 'retail' && r.min_quantity == null;

const now = () => new Date().toISOString();

/**
 * Price-list rows changed (edit, add, import, link) → copy their base price
 * onto the product or package they belong to. With no ids, checks every row.
 */
export async function syncCatalogFromPriceRows(supabase: SupabaseClient, ids?: string[]): Promise<void> {
  if (ids && ids.length === 0) return;
  let q = supabase.from('מחירון').select('id, מוצר_id, product_name_snapshot, price_type, מחיר, min_quantity, פעיל');
  if (ids) q = q.in('id', ids);
  const { data, error } = await q;
  if (error) { console.error('[price-sync] load rows failed:', error.code); return; }

  for (const r of ((data ?? []) as unknown as PriceRow[]).filter(isBaseRow)) {
    const price = Number(r.מחיר);
    if (!Number.isFinite(price)) continue;
    if (r.מוצר_id) {
      const { error: e } = await supabase.from('מוצרים_למכירה')
        .update({ מחיר: price, תאריך_עדכון: now() })
        .eq('id', r.מוצר_id).neq('מחיר', price);
      if (e) console.error('[price-sync] product price failed:', e.code, r.מוצר_id);
      continue;
    }
    const size = packageSizeFromPriceName(r.product_name_snapshot);
    if (!size) continue;
    const { error: e } = await supabase.from('מארזים')
      .update({ מחיר_מארז: price, תאריך_עדכון: now() })
      .eq('גודל_מארז', size).neq('מחיר_מארז', price);
    if (e) console.error('[price-sync] package price failed:', e.code, 'size', size);
  }
}

/**
 * Products changed → copy name and sku onto all their price-list rows, and,
 * when `withPrice`, the base price onto their base row. With no ids, all products.
 */
export async function syncPriceRowsFromProducts(
  supabase: SupabaseClient,
  ids: string[] | undefined,
  { withPrice }: { withPrice: boolean },
): Promise<void> {
  if (ids && ids.length === 0) return;
  let q = supabase.from('מוצרים_למכירה').select('id, שם_מוצר, sku, מחיר');
  if (ids) q = q.in('id', ids);
  const { data, error } = await q;
  if (error) { console.error('[price-sync] load products failed:', error.code); return; }

  type P = { id: string; שם_מוצר: string | null; sku: string | null; מחיר: unknown };
  for (const p of (data ?? []) as unknown as P[]) {
    if (p.שם_מוצר) {
      const { error: e } = await supabase.from('מחירון')
        // A product without a code keeps whatever code its rows already carry.
        .update(p.sku ? { product_name_snapshot: p.שם_מוצר, sku: p.sku } : { product_name_snapshot: p.שם_מוצר })
        .eq('מוצר_id', p.id);
      if (e) console.error('[price-sync] row names failed:', e.code, p.id);
    }
    const price = Number(p.מחיר);
    if (!withPrice || !Number.isFinite(price)) continue;
    const { error: e } = await supabase.from('מחירון')
      .update({ מחיר: price, תאריך_עדכון: now() })
      .eq('מוצר_id', p.id).eq('price_type', 'retail').eq('פעיל', true).is('min_quantity', null)
      .neq('מחיר', price);
    if (e) console.error('[price-sync] row price failed:', e.code, p.id);
  }
}

/** A package's price changed → copy it onto its "מארז N" base row(s). */
export async function syncPriceRowFromPackage(supabase: SupabaseClient, size: number, price: number): Promise<void> {
  if (!(size > 0) || !Number.isFinite(price)) return;
  const { data, error } = await supabase.from('מחירון')
    .select('id, מוצר_id, product_name_snapshot, price_type, מחיר, min_quantity, פעיל')
    .is('מוצר_id', null)
    .ilike('product_name_snapshot', 'מארז%');
  if (error) { console.error('[price-sync] load package rows failed:', error.code); return; }
  const ids = ((data ?? []) as unknown as PriceRow[])
    .filter(r => isBaseRow(r) && packageSizeFromPriceName(r.product_name_snapshot) === size && Number(r.מחיר) !== price)
    .map(r => r.id);
  if (ids.length === 0) return;
  const { error: e } = await supabase.from('מחירון').update({ מחיר: price, תאריך_עדכון: now() }).in('id', ids);
  if (e) console.error('[price-sync] package row failed:', e.code, 'size', size);
}
