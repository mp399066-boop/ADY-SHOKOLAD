// Server-only helpers for /api/costs routes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostRowInput } from '@/lib/product-costs-schema';
import type { CostRawMaterial } from '@/lib/product-costs';
import { missingColumnMessage } from '@/lib/db-error';

const RAW_COLUMNS = 'id, שם_חומר_גלם, יחידת_מידה, מחיר_ליחידה, תאריך_עדכון';

/**
 * Raw materials with their prices for cost calculation. Reads the
 * מחיר_כולל_מעמ flag (migration 067); until that migration is run every
 * price counts as before VAT — the behaviour before the flag existed.
 */
export async function loadCostRawMaterials(supabase: SupabaseClient): Promise<{
  data: CostRawMaterial[];
  vatFlagReady: boolean;
  error: { code?: string | null } | null;
}> {
  let vatFlagReady = true;
  const fetchRaw = (columns: string) => supabase.from('מלאי_חומרי_גלם').select(columns).order('שם_חומר_גלם');
  let res = await fetchRaw(`${RAW_COLUMNS}, מחיר_כולל_מעמ`);
  if (res.error && missingColumnMessage(res.error)) {
    vatFlagReady = false;
    res = await fetchRaw(RAW_COLUMNS);
  }
  if (res.error) return { data: [], vatFlagReady, error: res.error };
  type RawRow = Omit<CostRawMaterial, 'מחיר_ליחידה'> & { מחיר_ליחידה: unknown };
  const data = ((res.data ?? []) as unknown as RawRow[]).map(m => ({
    ...m,
    מחיר_ליחידה: m.מחיר_ליחידה == null ? null : Number(m.מחיר_ליחידה),
    מחיר_כולל_מעמ: m.מחיר_כולל_מעמ === true,
  }));
  return { data, vatFlagReady, error: null };
}

/** Confirms the linked catalog item and recipe exist. Returns an error message or null. */
export async function validateCostLinks(supabase: SupabaseClient, input: CostRowInput): Promise<string | null> {
  if (input.סוג_יעד && input.יעד_id) {
    const table = input.סוג_יעד === 'sale_product' ? 'מוצרים_למכירה' : 'סוגי_פטיפורים';
    const { data } = await supabase.from(table).select('id').eq('id', input.יעד_id).maybeSingle();
    if (!data) return 'המוצר המקושר לא נמצא בקטלוג';
  }
  if (input.מתכון_id) {
    const { data } = await supabase.from('מתכונים').select('id').eq('id', input.מתכון_id).maybeSingle();
    if (!data) return 'המתכון המקושר לא נמצא';
  }
  return null;
}

/** Postgres unique violation on (שם, גודל). */
export function isDuplicateName(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

export const DUPLICATE_NAME_ERROR = 'כבר קיימת שורת עלות עם אותו שם ואותו גודל';
