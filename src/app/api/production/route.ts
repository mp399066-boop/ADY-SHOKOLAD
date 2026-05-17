export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ייצור')
    .select('*, מוצרים_למכירה(שם_מוצר), מתכונים(id, שם_מתכון)')
    .order('תאריך_ייצור', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.מתכון_id && !body.מוצר_id) {
    return NextResponse.json({ error: 'מתכון הוא שדה חובה' }, { status: 400 });
  }
  const batches = Number(body.כמות_שיוצרה);
  if (!batches || batches <= 0) {
    return NextResponse.json({ error: 'כמות היא שדה חובה' }, { status: 400 });
  }

  // Fetch recipe(s) with current ingredient stock.
  // Recipe-direct (מתכון_id): fetch one recipe and use batches directly.
  // Legacy product-based (מוצר_id): fetch all recipes for the product.
  type IngredientRow = {
    id: string;
    חומר_גלם_id: string;
    כמות_נדרשת: number;
    יחידת_מידה: string;
    מלאי_חומרי_גלם: { שם_חומר_גלם: string; כמות_במלאי: number; יחידת_מידה: string } | null;
  };
  type RecipeRow = { id: string; שם_מתכון: string; כמות_תוצר: number; רכיבי_מתכון: IngredientRow[] };

  let recipes: RecipeRow[] = [];

  if (body.מתכון_id) {
    const { data, error } = await supabase
      .from('מתכונים')
      .select('id, שם_מתכון, כמות_תוצר, רכיבי_מתכון(id, חומר_גלם_id, כמות_נדרשת, יחידת_מידה, מלאי_חומרי_גלם(שם_חומר_גלם, כמות_במלאי, יחידת_מידה))')
      .eq('id', body.מתכון_id)
      .single();
    if (error || !data) return NextResponse.json({ error: 'מתכון לא נמצא' }, { status: 404 });
    recipes = [data as RecipeRow];
  } else {
    const { data } = await supabase
      .from('מתכונים')
      .select('id, שם_מתכון, כמות_תוצר, רכיבי_מתכון(id, חומר_גלם_id, כמות_נדרשת, יחידת_מידה, מלאי_חומרי_גלם(שם_חומר_גלם, כמות_במלאי, יחידת_מידה))')
      .eq('מוצר_id', body.מוצר_id);
    recipes = (data ?? []) as RecipeRow[];
  }

  // ── Pre-check: stock and unit compatibility ─────────────────────────────
  // Recipe-direct: multiplier = batches (כמות_נדרשת is per-batch)
  // Legacy:        multiplier = batches / recipe.כמות_תוצר (units mode)
  const insufficiency: string[] = [];
  const unitMismatch: string[] = [];

  for (const recipe of recipes) {
    const multiplier = body.מתכון_id ? batches : batches / (recipe.כמות_תוצר || 1);
    for (const ing of recipe.רכיבי_מתכון ?? []) {
      const mat = ing.מלאי_חומרי_גלם;
      if (!mat) continue;
      if (ing.יחידת_מידה !== mat.יחידת_מידה) {
        unitMismatch.push(
          `${mat.שם_חומר_גלם}: יחידות לא תואמות — מתכון: ${ing.יחידת_מידה}, מלאי: ${mat.יחידת_מידה}`,
        );
        continue;
      }
      const required = ing.כמות_נדרשת * multiplier;
      const available = Number(mat.כמות_במלאי) || 0;
      if (required > available) {
        insufficiency.push(
          `אין מספיק מלאי עבור: ${mat.שם_חומר_גלם}. נדרש ${required.toFixed(3)} ${ing.יחידת_מידה}, קיים ${available} ${mat.יחידת_מידה}`,
        );
      }
    }
  }

  if (insufficiency.length > 0 || unitMismatch.length > 0) {
    return NextResponse.json(
      { error: 'לא ניתן לייצר — בעיות מלאי', insufficiency, unitMismatch },
      { status: 422 },
    );
  }

  // ── Create production record ────────────────────────────────────────────
  const { data: production, error: prodError } = await supabase
    .from('ייצור')
    .insert({
      מוצר_id:       body.מוצר_id || null,
      מתכון_id:      body.מתכון_id || null,
      כמות_שיוצרה:  batches,
      תאריך_ייצור:  body.תאריך_ייצור || new Date().toISOString().split('T')[0],
      הערות:         body.הערות || null,
      נוצר_על_ידי:  auth.email,
    })
    .select()
    .single();

  if (prodError || !production) {
    return NextResponse.json(
      { error: prodError?.message || 'שגיאה ביצירת רשומת ייצור' },
      { status: 500 },
    );
  }

  // ── Deduct raw materials and record movements ───────────────────────────
  for (const recipe of recipes) {
    const multiplier = body.מתכון_id ? batches : batches / (recipe.כמות_תוצר || 1);
    for (const ing of recipe.רכיבי_מתכון ?? []) {
      const mat = ing.מלאי_חומרי_גלם;
      if (!mat) continue;
      if (ing.יחידת_מידה !== mat.יחידת_מידה) continue;

      const deduction = ing.כמות_נדרשת * multiplier;
      const before = Number(mat.כמות_במלאי) || 0;
      const after = Math.max(0, before - deduction);

      await supabase
        .from('מלאי_חומרי_גלם')
        .update({ כמות_במלאי: after })
        .eq('id', ing.חומר_גלם_id);

      await recordStockMovement(supabase, {
        itemKind:   'חומר_גלם',
        itemId:     ing.חומר_גלם_id,
        itemName:   mat.שם_חומר_גלם,
        before,
        after,
        sourceKind: 'מערכת',
        sourceId:   production.id,
        notes:      `הורדת חומר גלם עבור ייצור מתכון: ${recipe.שם_מתכון || '—'}`,
        createdBy:  auth.email,
      });
    }
  }

  return NextResponse.json({ data: production }, { status: 201 });
}
