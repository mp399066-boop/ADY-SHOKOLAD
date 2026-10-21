// Server-only helpers for /api/costs routes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostRowInput } from '@/lib/product-costs-schema';
import type { CostRawMaterial, CostRowMaterial, CostRowRecipe } from '@/lib/product-costs';
import { missingColumnMessage } from '@/lib/db-error';
import { isMissingTable } from '@/lib/finance-expense-schema';
import { fetchAllPages } from '@/lib/supabase/fetch-all';

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
  const recipeIds = [...new Set([input.מתכון_id, ...(input.מתכונים ?? []).map(l => l.מתכון_id)].filter((id): id is string => !!id))];
  if (recipeIds.length) {
    const { data } = await supabase.from('מתכונים').select('id').in('id', recipeIds);
    if ((data ?? []).length !== recipeIds.length) return 'המתכון המקושר לא נמצא';
  }
  const materialIds = (input.חומרים ?? []).map(l => l.חומר_גלם_id);
  if (materialIds.length) {
    const { data } = await supabase.from('מלאי_חומרי_גלם').select('id').in('id', materialIds);
    if ((data ?? []).length !== materialIds.length) return 'חומר הגלם שנבחר לא נמצא';
  }
  return null;
}

/**
 * Direct raw materials of every cost row (migration 071), keyed by cost row
 * id. ready=false until the migration is run — rows then have none.
 */
export async function loadCostMaterialLinks(supabase: SupabaseClient): Promise<{
  byRow: Map<string, CostRowMaterial[]>;
  ready: boolean;
  error: { code?: string | null } | null;
}> {
  const byRow = new Map<string, CostRowMaterial[]>();
  type LinkRow = { עלות_id: string; חומר_גלם_id: string; כמות: unknown; יחידת_מידה: string };
  type LinkPage = { data: LinkRow[] | null; error: { message: string; code?: string } | null };
  const res = await fetchAllPages<LinkRow>((from, to) =>
    supabase.from('חומרי_עלות').select('עלות_id, חומר_גלם_id, כמות, יחידת_מידה')
      .order('סדר').order('id').range(from, to) as unknown as PromiseLike<LinkPage>);
  if (res.error) {
    if (isMissingTable(res.error)) return { byRow, ready: false, error: null };
    return { byRow, ready: true, error: res.error };
  }
  for (const l of res.data) {
    const list = byRow.get(l.עלות_id) ?? [];
    list.push({ חומר_גלם_id: l.חומר_גלם_id, כמות: Number(l.כמות) || 0, יחידת_מידה: l.יחידת_מידה });
    byRow.set(l.עלות_id, list);
  }
  return { byRow, ready: true, error: null };
}

/** True when the direct raw-materials table (migration 071) exists. */
export async function materialLinksTableReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('חומרי_עלות').select('id').limit(1);
  return !isMissingTable(error);
}

/**
 * Replaces a cost row's direct raw materials: upserts the new list, then
 * removes materials no longer in it. Returns 'missing' before migration 071.
 */
export async function saveCostMaterialLinks(
  supabase: SupabaseClient, costId: string, links: CostRowMaterial[],
): Promise<'ok' | 'missing' | { code?: string | null }> {
  if (links.length) {
    const { error } = await supabase.from('חומרי_עלות').upsert(
      links.map((l, i) => ({ עלות_id: costId, חומר_גלם_id: l.חומר_גלם_id, כמות: l.כמות, יחידת_מידה: l.יחידת_מידה, סדר: i })),
      { onConflict: 'עלות_id,חומר_גלם_id' },
    );
    if (error) return isMissingTable(error) ? 'missing' : error;
  }
  let del = supabase.from('חומרי_עלות').delete().eq('עלות_id', costId);
  if (links.length) del = del.not('חומר_גלם_id', 'in', `(${links.map(l => l.חומר_גלם_id).join(',')})`);
  const { error } = await del;
  if (error) return isMissingTable(error) ? 'missing' : error;
  return 'ok';
}

/**
 * Sub-recipe links of every cost row (migration 070), keyed by cost row id.
 * ready=false until the migration is run — rows then fall back to their
 * single מתכון_id.
 */
export async function loadCostRecipeLinks(supabase: SupabaseClient): Promise<{
  byRow: Map<string, CostRowRecipe[]>;
  ready: boolean;
  error: { code?: string | null } | null;
}> {
  const byRow = new Map<string, CostRowRecipe[]>();
  type LinkRow = { עלות_id: string; מתכון_id: string; יחידות_מהמתכון: unknown };
  type LinkPage = { data: LinkRow[] | null; error: { message: string; code?: string } | null };
  const res = await fetchAllPages<LinkRow>((from, to) =>
    supabase.from('מתכוני_עלות').select('עלות_id, מתכון_id, יחידות_מהמתכון')
      .order('סדר').order('id').range(from, to) as unknown as PromiseLike<LinkPage>);
  if (res.error) {
    if (isMissingTable(res.error)) return { byRow, ready: false, error: null };
    return { byRow, ready: true, error: res.error };
  }
  for (const l of res.data) {
    const list = byRow.get(l.עלות_id) ?? [];
    list.push({ מתכון_id: l.מתכון_id, יחידות: Number(l.יחידות_מהמתכון) || 1 });
    byRow.set(l.עלות_id, list);
  }
  return { byRow, ready: true, error: null };
}

/** True when the sub-recipe table (migration 070) exists. */
export async function recipeLinksTableReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('מתכוני_עלות').select('id').limit(1);
  return !isMissingTable(error);
}

/**
 * Does saving these links need migration 070? A single recipe at its own
 * yield is exactly what the old מתכון_id column already expresses.
 */
export async function needsRecipeLinksTable(supabase: SupabaseClient, links: CostRowRecipe[]): Promise<boolean> {
  if (links.length > 1) return true;
  if (links.length === 0) return false;
  const { data } = await supabase.from('מתכונים').select('כמות_תוצר').eq('id', links[0].מתכון_id).maybeSingle();
  const recipeYield = Number((data as { כמות_תוצר?: unknown } | null)?.כמות_תוצר) || 1;
  return Math.abs(recipeYield - links[0].יחידות) > 0.001;
}

/**
 * Replaces a cost row's sub-recipe links: upserts the new list (with its
 * order), then removes links no longer in it — so a failure part-way never
 * leaves the row with no recipes. Returns 'missing' before migration 070.
 */
export async function saveCostRecipeLinks(
  supabase: SupabaseClient, costId: string, links: CostRowRecipe[],
): Promise<'ok' | 'missing' | { code?: string | null }> {
  if (links.length) {
    const { error } = await supabase.from('מתכוני_עלות').upsert(
      links.map((l, i) => ({ עלות_id: costId, מתכון_id: l.מתכון_id, יחידות_מהמתכון: l.יחידות, סדר: i })),
      { onConflict: 'עלות_id,מתכון_id' },
    );
    if (error) return isMissingTable(error) ? 'missing' : error;
  }
  let del = supabase.from('מתכוני_עלות').delete().eq('עלות_id', costId);
  if (links.length) del = del.not('מתכון_id', 'in', `(${links.map(l => l.מתכון_id).join(',')})`);
  const { error } = await del;
  if (error) return isMissingTable(error) ? 'missing' : error;
  return 'ok';
}

/** Postgres unique violation on (שם, גודל). */
export function isDuplicateName(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}

export const DUPLICATE_NAME_ERROR = 'כבר קיימת שורת עלות עם אותו שם ואותו גודל';
