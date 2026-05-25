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

  // ── Recipe → product link validation ────────────────────────────────────
  // Production must close the inventory loop: raws OUT → finished product IN.
  // Both halves require knowing WHICH finished product to increment, which
  // lives on מתכונים.מוצר_id. If any fetched recipe has no מוצר_id, we cannot
  // safely deduct raws (operator would lose raw stock without a corresponding
  // finished-product increase). Reject the whole request — no ייצור row, no
  // raw deduction. Same gate must catch the empty-recipes case (legacy mode
  // with a מוצר_id that no recipe is bound to).
  if (recipes.length === 0) {
    return NextResponse.json(
      { error: 'לא ניתן לרשום ייצור: לא נמצא מתכון למוצר זה' },
      { status: 400 },
    );
  }
  type RecipeWithProduct = RecipeRow & { מוצר_id: string | null };
  const recipesWithProduct = recipes as RecipeWithProduct[];
  const missingLink = recipesWithProduct.some(r => !r.מוצר_id);
  if (missingLink) {
    return NextResponse.json(
      { error: 'לא ניתן לרשום ייצור: המתכון לא משויך למוצר למכירה' },
      { status: 400 },
    );
  }
  const targetProductIds = new Set(recipesWithProduct.map(r => r.מוצר_id as string));
  if (targetProductIds.size !== 1) {
    // Legacy-mode safeguard: every recipe fetched for a given מוצר_id should
    // map back to the same product. If somehow not, refuse rather than guess.
    return NextResponse.json(
      { error: 'לא ניתן לרשום ייצור: מתכונים מקושרים למוצרים שונים' },
      { status: 400 },
    );
  }
  const targetProductId = recipesWithProduct[0].מוצר_id as string;

  // ── Fetch target finished product (current stock + name for the movement) ─
  const { data: targetProduct, error: prodFetchError } = await supabase
    .from('מוצרים_למכירה')
    .select('id, שם_מוצר, כמות_במלאי, פעיל')
    .eq('id', targetProductId)
    .single();
  if (prodFetchError || !targetProduct) {
    return NextResponse.json(
      { error: 'לא ניתן לרשום ייצור: המוצר המקושר לא נמצא במלאי' },
      { status: 400 },
    );
  }

  // ── Create production record ────────────────────────────────────────────
  const { data: production, error: prodError } = await supabase
    .from('ייצור')
    .insert({
      מוצר_id:       body.מוצר_id || targetProductId,
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

  // ── Increase finished product stock FIRST ───────────────────────────────
  // Ordering rationale (no DB transaction available — Supabase JS client
  // chains separate requests). We do this BEFORE the raw-material loop so
  // that if this single UPDATE fails (network glitch, RLS, etc.) no raws
  // are deducted — operator simply re-runs after fixing the cause. If it
  // succeeds and the raw loop then partial-fails, the ledger captures
  // exactly what was deducted so the discrepancy is reconcilable from
  // תנועות_מלאי. Both halves write a movement row.
  //
  // Output unit count = `batches` (the operator's "כמות לייצור" input). In
  // recipe-direct mode this is per-batch by design; in legacy mode the raw
  // multiplier (batches / recipe.כמות_תוצר) is already scaled to produce
  // `batches` units total — so the finished increment is `batches` either
  // way, exactly once per production request.
  const finishedBefore = Number(targetProduct.כמות_במלאי) || 0;
  const finishedAfter = finishedBefore + batches;
  const { error: finUpdateError } = await supabase
    .from('מוצרים_למכירה')
    .update({ כמות_במלאי: finishedAfter })
    .eq('id', targetProductId);
  if (finUpdateError) {
    return NextResponse.json(
      { error: `לא הצלחנו לעדכן את מלאי המוצר — לא הופחתו חומרי גלם. ${finUpdateError.message}` },
      { status: 500 },
    );
  }
  await recordStockMovement(supabase, {
    itemKind:   'מוצר',
    itemId:     targetProductId,
    itemName:   targetProduct.שם_מוצר,
    before:     finishedBefore,
    after:      finishedAfter,
    sourceKind: 'מערכת',
    sourceId:   production.id,
    notes:      `הוספת מוצר מייצור (${batches} יחידות) — מתכון: ${recipesWithProduct.map(r => r.שם_מתכון).join(' / ') || '—'}`,
    createdBy:  auth.email,
  });

  // ── Deduct raw materials and record movements ───────────────────────────
  for (const recipe of recipesWithProduct) {
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
    finishedProductDelta: {
      productId: targetProductId,
      productName: targetProduct.שם_מוצר,
      before: finishedBefore,
      after: finishedAfter,
      added: batches,
    },
  }, { status: 201 });
}
