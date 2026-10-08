// Server-only helpers for /api/costs routes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostRowInput } from '@/lib/product-costs-schema';

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
