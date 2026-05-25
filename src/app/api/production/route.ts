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
  type RecipeRow = {
    id: string;
    שם_מתכון: string;
    כמות_תוצר: number;
    מוצר_id: string | null;
    production_target_type: 'sale_product' | 'petit_four';
    production_target_id: string | null;
    רכיבי_מתכון: IngredientRow[];
  };

  // SELECT must include the new polymorphic columns so the loop below
  // can route the finished increment to the right table per recipe.
  const recipeColumns =
    'id, שם_מתכון, כמות_תוצר, מוצר_id, production_target_type, production_target_id, רכיבי_מתכון(id, חומר_גלם_id, כמות_נדרשת, יחידת_מידה, מלאי_חומרי_גלם(שם_חומר_גלם, כמות_במלאי, יחידת_מידה))';

  let recipes: RecipeRow[] = [];

  if (body.מתכון_id) {
    const { data, error } = await supabase
      .from('מתכונים')
      .select(recipeColumns)
      .eq('id', body.מתכון_id)
      .single();
    if (error || !data) return NextResponse.json({ error: 'מתכון לא נמצא' }, { status: 404 });
    recipes = [data as RecipeRow];
  } else {
    // Legacy mode: caller passed a מוצר_id (sale product). Fetch all
    // recipes whose target is that sale product. Petit-four recipes
    // aren't reachable through legacy mode — they require מתכון_id.
    const { data } = await supabase
      .from('מתכונים')
      .select(recipeColumns)
      .eq('production_target_type', 'sale_product')
      .eq('production_target_id', body.מוצר_id);
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

  // ── Recipe → production-target link validation ──────────────────────────
  // Production must close the inventory loop: raws OUT → finished IN. Each
  // recipe declares its target via two columns (migration 044):
  //   production_target_type ∈ {'sale_product','petit_four'}
  //   production_target_id   = id in the target table (NULL = unlinked)
  // We refuse the whole request if any fetched recipe is unlinked OR if
  // recipes in the same request resolve to different (type,id) pairs.
  if (recipes.length === 0) {
    return NextResponse.json(
      { error: 'לא ניתן לרשום ייצור: לא נמצא מתכון מתאים' },
      { status: 400 },
    );
  }
  const missingLink = recipes.some(r => !r.production_target_id);
  if (missingLink) {
    return NextResponse.json(
      { error: 'המתכון לא משויך למלאי מוגמר — לא ניתן לרשום ייצור' },
      { status: 400 },
    );
  }
  const targetKey = (r: RecipeRow) => `${r.production_target_type}:${r.production_target_id}`;
  const distinctTargets = new Set(recipes.map(targetKey));
  if (distinctTargets.size !== 1) {
    return NextResponse.json(
      { error: 'לא ניתן לרשום ייצור: מתכונים מקושרים ליעדים שונים' },
      { status: 400 },
    );
  }
  const targetType = recipes[0].production_target_type;
  const targetId   = recipes[0].production_target_id as string;

  // ── Fetch target finished item (sale product OR petit-four type) ────────
  // Two table layouts share the same column names for stock + status —
  // we just pick the right table by production_target_type.
  let finishedBefore = 0;
  let finishedItemName = '';
  if (targetType === 'sale_product') {
    const { data, error } = await supabase
      .from('מוצרים_למכירה')
      .select('id, שם_מוצר, כמות_במלאי, פעיל')
      .eq('id', targetId)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: 'לא ניתן לרשום ייצור: המוצר המקושר לא נמצא במלאי' },
        { status: 400 },
      );
    }
    finishedBefore   = Number(data.כמות_במלאי) || 0;
    finishedItemName = String(data.שם_מוצר ?? '');
  } else {
    const { data, error } = await supabase
      .from('סוגי_פטיפורים')
      .select('id, שם_פטיפור, כמות_במלאי, פעיל')
      .eq('id', targetId)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: 'לא ניתן לרשום ייצור: סוג הפטיפור המקושר לא נמצא במלאי' },
        { status: 400 },
      );
    }
    finishedBefore   = Number(data.כמות_במלאי) || 0;
    finishedItemName = String(data.שם_פטיפור ?? '');
  }

  // ── Create production record ────────────────────────────────────────────
  // ייצור.מוצר_id is the legacy sale-product link — we keep populating it
  // ONLY for sale-product targets so historical reads stay accurate. For
  // petit-four targets it's left null (the polymorphic info lives on
  // מתכונים, joined via מתכון_id). מתכון_id is set whenever the caller
  // supplied one.
  const { data: production, error: prodError } = await supabase
    .from('ייצור')
    .insert({
      מוצר_id:       targetType === 'sale_product' ? targetId : null,
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

  // ── Increase finished stock FIRST ───────────────────────────────────────
  // Ordering rationale (no DB transaction available — Supabase JS client
  // chains separate requests). We do this BEFORE the raw-material loop so
  // that if this single UPDATE fails (network glitch, RLS, etc.) no raws
  // are deducted — operator simply re-runs after fixing the cause. If it
  // succeeds and the raw loop then partial-fails, the ledger captures
  // exactly what was deducted so the discrepancy is reconcilable from
  // תנועות_מלאי. Both halves write a movement row.
  //
  // Output unit count = `batches` (the operator's "כמות לייצור" input).
  // Both target types treat batches as a unit count.
  const finishedAfter = finishedBefore + batches;
  const targetTable = targetType === 'sale_product' ? 'מוצרים_למכירה' : 'סוגי_פטיפורים';
  const ledgerKind: 'מוצר' | 'פטיפור' = targetType === 'sale_product' ? 'מוצר' : 'פטיפור';
  const { error: finUpdateError } = await supabase
    .from(targetTable)
    .update({ כמות_במלאי: finishedAfter })
    .eq('id', targetId);
  if (finUpdateError) {
    return NextResponse.json(
      { error: `לא הצלחנו לעדכן את מלאי המוצר — לא הופחתו חומרי גלם. ${finUpdateError.message}` },
      { status: 500 },
    );
  }
  await recordStockMovement(supabase, {
    itemKind:   ledgerKind,
    itemId:     targetId,
    itemName:   finishedItemName,
    before:     finishedBefore,
    after:      finishedAfter,
    sourceKind: 'מערכת',
    sourceId:   production.id,
    notes:      `הוספת ${ledgerKind === 'פטיפור' ? 'סוג פטיפור' : 'מוצר'} מייצור (${batches} יחידות) — מתכון: ${recipes.map(r => r.שם_מתכון).join(' / ') || '—'}`,
    createdBy:  auth.email,
  });

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

  return NextResponse.json({
    data: production,
    finishedDelta: {
      targetType,
      targetId,
      targetName: finishedItemName,
      before: finishedBefore,
      after: finishedAfter,
      added: batches,
    },
  }, { status: 201 });
}
