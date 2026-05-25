export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// ─────────────────────────────────────────────────────────────────────────
//  Auto-link apply — writes מתכונים.מוצר_id for confirmed safe matches.
// ─────────────────────────────────────────────────────────────────────────
//
// Server-side re-validates every pair the client sends before writing:
//   • Recipe must exist AND have מוצר_id IS NULL (never overwrite).
//   • Product must exist AND have פעיל = true (never link to inactive).
// Pairs that fail re-validation are skipped with a reason, not failed.
//
// Returns counts so the UI can show the operator exactly what happened.

type Pair = { recipeId: string; productId: string };

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  let body: { pairs?: Pair[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  const pairs: Pair[] = Array.isArray(body.pairs) ? body.pairs : [];
  if (pairs.length === 0) {
    return NextResponse.json({ error: 'לא נשלחו זוגות מתכון-מוצר לעיבוד' }, { status: 400 });
  }

  // Dedupe by recipeId (a recipe may only end up in one pair).
  const recipeIds = Array.from(new Set(pairs.map(p => p.recipeId).filter(Boolean)));
  const productIds = Array.from(new Set(pairs.map(p => p.productId).filter(Boolean)));

  // Fetch all referenced recipes + products in two queries.
  const [{ data: recipesData }, { data: productsData }] = await Promise.all([
    supabase.from('מתכונים').select('id, מוצר_id, שם_מתכון').in('id', recipeIds),
    supabase.from('מוצרים_למכירה').select('id, פעיל, שם_מוצר').in('id', productIds),
  ]);
  const recipeMap  = new Map<string, { id: string; מוצר_id: string | null; שם_מתכון: string }>(
    (recipesData ?? []).map((r: { id: string; מוצר_id: string | null; שם_מתכון: string }) => [r.id, r]),
  );
  const productMap = new Map<string, { id: string; פעיל: boolean; שם_מוצר: string }>(
    (productsData ?? []).map((p: { id: string; פעיל: boolean; שם_מוצר: string }) => [p.id, p]),
  );

  let linked = 0;
  const skipped: Array<{ recipeId: string; reason: string }> = [];

  // Sequential — keeps logs readable and dependency-order explicit.
  // Volume is tiny (≤ unlinked recipe count, ≤ ~50 in this CRM's practical
  // upper bound) so no need for batched/concurrent writes.
  for (const pair of pairs) {
    if (!pair.recipeId || !pair.productId) {
      skipped.push({ recipeId: pair.recipeId || '', reason: 'pair חסר recipeId או productId' });
      continue;
    }
    const recipe = recipeMap.get(pair.recipeId);
    if (!recipe) { skipped.push({ recipeId: pair.recipeId, reason: 'recipe לא נמצא' }); continue; }
    if (recipe.מוצר_id) { skipped.push({ recipeId: pair.recipeId, reason: 'recipe כבר משויך למוצר אחר' }); continue; }

    const product = productMap.get(pair.productId);
    if (!product) { skipped.push({ recipeId: pair.recipeId, reason: 'product לא נמצא' }); continue; }
    if (!product.פעיל) { skipped.push({ recipeId: pair.recipeId, reason: 'product לא פעיל' }); continue; }

    const { error: updErr } = await supabase
      .from('מתכונים')
      .update({ מוצר_id: pair.productId })
      .eq('id', pair.recipeId)
      .is('מוצר_id', null); // belt-and-suspenders — refuses if row was linked between read and write
    if (updErr) {
      skipped.push({ recipeId: pair.recipeId, reason: updErr.message });
      continue;
    }
    linked += 1;
  }

  // Safe log — counts and user only. No recipe/product names.
  console.log('[recipes/auto-link/apply]',
    'requestedPairs:', pairs.length,
    '| linked:', linked,
    '| skipped:', skipped.length,
    '| by:', auth.email,
  );

  return NextResponse.json({ linked, skipped, requested: pairs.length });
}
