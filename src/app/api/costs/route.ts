export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { isMissingTable } from '@/lib/finance-expense-schema';
import {
  costRowInputSchema, COSTS_MIGRATION_HINT, COST_COLUMNS, normalizeCostRow,
} from '@/lib/product-costs-schema';
import { validateCostLinks, isDuplicateName, DUPLICATE_NAME_ERROR } from '@/lib/product-costs-server';

// GET  /api/costs → everything the /costs page needs to compute costs live:
//      { rows, tableReady, recipes, rawMaterials, catalog, hourlyRate }
// POST /api/costs → create one cost row

export async function GET() {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  const supabase = createAdminClient();

  const [rowsRes, recipesRes, rawRes, productsRes, pfRes, rateRes] = await Promise.all([
    supabase.from('עלויות_מוצרים').select(COST_COLUMNS).order('סדר').order('שם'),
    supabase.from('מתכונים')
      .select('id, שם_מתכון, כמות_תוצר, יחידת_תפוקה, production_target_type, production_target_id, רכיבי_מתכון(חומר_גלם_id, כמות_נדרשת, יחידת_מידה)')
      .order('שם_מתכון'),
    supabase.from('מלאי_חומרי_גלם')
      .select('id, שם_חומר_גלם, יחידת_מידה, מחיר_ליחידה, תאריך_עדכון')
      .order('שם_חומר_גלם'),
    supabase.from('מוצרים_למכירה').select('id, שם_מוצר, מחיר, פעיל').order('שם_מוצר'),
    supabase.from('סוגי_פטיפורים').select('id, שם_פטיפור, פעיל').order('שם_פטיפור'),
    supabase.from('system_config').select('value').eq('key', 'labor_hourly_rate').maybeSingle(),
  ]);

  const firstError = recipesRes.error || rawRes.error || productsRes.error || pfRes.error;
  if (firstError) {
    console.error('[costs GET]', { code: firstError.code });
    return NextResponse.json({ error: 'שגיאה בטעינת נתוני העלויות' }, { status: 500 });
  }

  let tableReady = true;
  let rows: Record<string, unknown>[] = [];
  if (rowsRes.error) {
    if (!isMissingTable(rowsRes.error)) {
      console.error('[costs GET rows]', { code: rowsRes.error.code });
      return NextResponse.json({ error: 'שגיאה בטעינת עלויות המוצרים' }, { status: 500 });
    }
    tableReady = false;
  } else {
    rows = ((rowsRes.data ?? []) as Record<string, unknown>[]).map(r => normalizeCostRow(r));
  }

  type Ing = { חומר_גלם_id: string; כמות_נדרשת: unknown; יחידת_מידה: string };
  type RecipeRow = { id: string; שם_מתכון: string; כמות_תוצר: unknown; יחידת_תפוקה: string | null; production_target_type: string | null; production_target_id: string | null; רכיבי_מתכון: Ing[] | null };
  type RawRow = { id: string; שם_חומר_גלם: string; יחידת_מידה: string; מחיר_ליחידה: unknown; תאריך_עדכון: string | null };
  type ProductRow = { id: string; שם_מוצר: string; מחיר: unknown; פעיל: boolean | null };
  type PetitFourRow = { id: string; שם_פטיפור: string; פעיל: boolean | null };

  const recipes = ((recipesRes.data ?? []) as RecipeRow[]).map(r => ({
    ...r,
    כמות_תוצר: Number(r.כמות_תוצר) || 1,
    רכיבי_מתכון: (r.רכיבי_מתכון ?? []).map(i => ({
      ...i, כמות_נדרשת: Number(i.כמות_נדרשת) || 0,
    })),
  }));
  const rawMaterials = ((rawRes.data ?? []) as RawRow[]).map(m => ({
    ...m,
    מחיר_ליחידה: m.מחיר_ליחידה == null ? null : Number(m.מחיר_ליחידה),
  }));
  const catalog = [
    ...((productsRes.data ?? []) as ProductRow[]).map(p => ({ type: 'sale_product' as const, id: p.id, name: p.שם_מוצר, price: p.מחיר == null ? null : Number(p.מחיר), active: p.פעיל !== false })),
    ...((pfRes.data ?? []) as PetitFourRow[]).map(f => ({ type: 'petit_four' as const, id: f.id, name: f.שם_פטיפור, price: null, active: f.פעיל !== false })),
  ];
  const rateNum = Number(rateRes.data?.value);
  const hourlyRate = rateRes.data?.value && rateNum > 0 ? rateNum : null;

  return NextResponse.json({
    rows, tableReady, hint: tableReady ? null : COSTS_MIGRATION_HINT,
    recipes, rawMaterials, catalog, hourlyRate,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const parsed = costRowInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const supabase = createAdminClient();
  const linkError = await validateCostLinks(supabase, parsed.data);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

  // New rows go to the end of the list.
  const { data: last } = await supabase.from('עלויות_מוצרים').select('סדר').order('סדר', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (Number((last as { סדר?: number } | null)?.סדר) || 0) + 1;

  const { data, error } = await supabase
    .from('עלויות_מוצרים')
    .insert({ ...parsed.data, סדר: nextOrder, עודכן_על_ידי: auth.email ?? null })
    .select(COST_COLUMNS)
    .single();
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: COSTS_MIGRATION_HINT }, { status: 400 });
    if (isDuplicateName(error)) return NextResponse.json({ error: DUPLICATE_NAME_ERROR }, { status: 400 });
    console.error('[costs POST]', { code: error.code });
    return NextResponse.json({ error: 'שמירת העלות נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ data: normalizeCostRow(data as Record<string, unknown>) }, { status: 201 });
}
