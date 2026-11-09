// Server-only: change an item's stock by a delta in ONE database statement.
//
// The old pattern — read כמות_במלאי, compute, write it back — loses updates
// when two orders touch the same item at the same moment (both read 10, both
// write 9, one deduction disappears). The adjust_stock() function from
// migration 076 does `כמות_במלאי = כמות_במלאי + delta` atomically and returns
// the before/after values for the ledger row.
//
// Until migration 076 is run the function is missing; we then fall back to
// the old read-then-write so nothing breaks.
import type { SupabaseClient } from '@supabase/supabase-js';

export type StockKind = 'מוצר' | 'פטיפור' | 'חומר_גלם';

const TABLE: Record<StockKind, { table: string; nameCol: string }> = {
  'מוצר':     { table: 'מוצרים_למכירה',  nameCol: 'שם_מוצר' },
  'פטיפור':   { table: 'סוגי_פטיפורים',  nameCol: 'שם_פטיפור' },
  'חומר_גלם': { table: 'מלאי_חומרי_גלם', nameCol: 'שם_חומר_גלם' },
};

export interface StockChange { before: number; after: number; name: string }

let rpcMissing = false; // remembered per server instance once we know

function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === 'PGRST202' || err.code === '42883'
    || (/adjust_stock/.test(err.message ?? '') && /not find|does not exist/i.test(err.message ?? ''));
}

/**
 * Adds `delta` (negative = take out) to the item's stock. Returns the values
 * before/after, or null when the item doesn't exist or the update failed.
 */
export async function adjustStock(
  supabase: SupabaseClient,
  kind: StockKind,
  id: string,
  delta: number,
): Promise<StockChange | null> {
  const { table, nameCol } = TABLE[kind];

  if (!rpcMissing) {
    const { data, error } = await supabase.rpc('adjust_stock', { p_kind: kind, p_id: id, p_delta: delta });
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as { before_qty: number; after_qty: number; item_name: string | null } | undefined;
      if (!row) return null;
      return { before: Number(row.before_qty) || 0, after: Number(row.after_qty) || 0, name: row.item_name ?? '' };
    }
    if (!isMissingFunction(error)) {
      console.error('[stock] adjust_stock failed', { kind, id, code: error.code });
      return null;
    }
    rpcMissing = true;
    console.warn('[stock] adjust_stock() missing — run migration 076. Falling back to read-then-write.');
  }

  const { data: row } = await supabase.from(table).select(`${nameCol}, כמות_במלאי`).eq('id', id).maybeSingle();
  if (!row) return null;
  const r = row as unknown as Record<string, unknown>;
  const before = Number(r['כמות_במלאי']) || 0;
  const after = before + delta;
  const { error } = await supabase.from(table).update({ כמות_במלאי: after }).eq('id', id);
  if (error) {
    console.error('[stock] fallback update failed', { kind, id, code: error.code });
    return null;
  }
  return { before, after, name: (r[nameCol] as string | null) ?? '' };
}
