export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// ─────────────────────────────────────────────────────────────────────────
//  Auto-link preview — READ-ONLY
// ─────────────────────────────────────────────────────────────────────────
//
// Scans recipes where מתכונים.מוצר_id IS NULL and proposes matches to
// active sale products in מוצרים_למכירה. NO DB writes — the preview only
// returns suggestions; the operator confirms via /api/recipes/auto-link-apply.
//
// Match safety levels (per spec):
//   • 'exact'      — normalized recipe name === normalized product name,
//                    exactly one such product. Status: 'מוכן לשיוך'
//   • 'contains'   — one side's normalized name is a substring of the
//                    other's, AND only one product qualifies, AND the
//                    recipe name is ≥3 chars long (avoid generic single-
//                    letter / short words). Status: 'מוכן לשיוך'
//   • 'review'     — 2+ candidate products. Status: 'צריך בדיקה ידנית'
//   • 'none'       — no candidate. Status: 'לא נמצא מוצר מתאים'
//
// Same-product collisions: if more than one recipe lands on the SAME
// product as its only safe match, all of them are demoted to 'review' so
// the operator decides which (if any) should bind. Two recipes legitimately
// producing the same product is a valid business case (different methods)
// but auto-linking it without confirmation is not safe.
//
// No private data is logged.

type RecipeRow = { id: string; שם_מתכון: string; מוצר_id: string | null };
type ProductRow = { id: string; שם_מוצר: string; פעיל: boolean };

function normalize(s: string): string {
  return s
    .normalize('NFKC')
    // strip Hebrew niqqud/cantillation marks
    .replace(/[֑-ׇ]/g, '')
    // common punctuation → space (keep letters/digits)
    .replace(/['"״׳`()\[\]{}.,!?:;\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type Candidate = {
  productId: string;
  productName: string;
  matchType: 'exact' | 'contains';
};

type SafeRow    = { recipeId: string; recipeName: string; productId: string; productName: string; matchType: 'exact' | 'contains' };
type ReviewRow  = { recipeId: string; recipeName: string; candidates: Candidate[] };
type UnmatchRow = { recipeId: string; recipeName: string };

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  // Unlinked recipes only — never modify already-linked ones.
  const { data: recipesData, error: recipesErr } = await supabase
    .from('מתכונים')
    .select('id, שם_מתכון, מוצר_id')
    .is('מוצר_id', null);
  if (recipesErr) return NextResponse.json({ error: recipesErr.message }, { status: 500 });
  const recipes = (recipesData ?? []) as RecipeRow[];

  // Active products only — never propose linking to inactive products.
  const { data: prodData, error: prodErr } = await supabase
    .from('מוצרים_למכירה')
    .select('id, שם_מוצר, פעיל')
    .eq('פעיל', true);
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });
  const products = (prodData ?? []) as ProductRow[];

  // Pre-normalize products once.
  const normProducts = products.map(p => ({ ...p, norm: normalize(p.שם_מוצר) }));

  // ── First pass: build per-recipe candidate lists ──────────────────────
  const provisional: Array<{ recipe: RecipeRow; status: 'safe' | 'review' | 'none'; matchType?: 'exact' | 'contains'; productId?: string; productName?: string; candidates?: Candidate[] }> = [];

  for (const r of recipes) {
    const rNorm = normalize(r.שם_מתכון);
    if (!rNorm) { provisional.push({ recipe: r, status: 'none' }); continue; }

    // Exact normalized matches (active products).
    const exacts = normProducts.filter(p => p.norm === rNorm);
    if (exacts.length === 1) {
      provisional.push({
        recipe: r,
        status: 'safe',
        matchType: 'exact',
        productId: exacts[0].id,
        productName: exacts[0].שם_מוצר,
      });
      continue;
    }
    if (exacts.length > 1) {
      provisional.push({
        recipe: r,
        status: 'review',
        candidates: exacts.map(p => ({ productId: p.id, productName: p.שם_מוצר, matchType: 'exact' })),
      });
      continue;
    }

    // Containment matches — only when the recipe name is ≥3 chars to avoid
    // matching generic single/two-letter tokens.
    if (rNorm.length < 3) { provisional.push({ recipe: r, status: 'none' }); continue; }
    const contains = normProducts.filter(p => p.norm.includes(rNorm) || rNorm.includes(p.norm));
    if (contains.length === 1) {
      provisional.push({
        recipe: r,
        status: 'safe',
        matchType: 'contains',
        productId: contains[0].id,
        productName: contains[0].שם_מוצר,
      });
      continue;
    }
    if (contains.length > 1) {
      provisional.push({
        recipe: r,
        status: 'review',
        candidates: contains.map(p => ({ productId: p.id, productName: p.שם_מוצר, matchType: 'contains' })),
      });
      continue;
    }

    provisional.push({ recipe: r, status: 'none' });
  }

  // ── Second pass: demote same-product collisions to 'review' ───────────
  // If multiple recipes safe-matched to the SAME product, the auto-pick is
  // ambiguous (which recipe should bind to it?). Spec: "if unsure, skip
  // and ask for manual review". Two recipes for the same product IS valid
  // in the business model, but only the operator should confirm.
  const productSafeCounts = new Map<string, number>();
  for (const p of provisional) {
    if (p.status === 'safe' && p.productId) {
      productSafeCounts.set(p.productId, (productSafeCounts.get(p.productId) ?? 0) + 1);
    }
  }
  const safe: SafeRow[] = [];
  const review: ReviewRow[] = [];
  const unmatched: UnmatchRow[] = [];

  for (const p of provisional) {
    if (p.status === 'safe' && p.productId && p.productName && p.matchType) {
      if ((productSafeCounts.get(p.productId) ?? 0) > 1) {
        // Same product is the only safe match for >1 recipe → demote both/all.
        review.push({
          recipe: p.recipe,
          recipeId: p.recipe.id,
          recipeName: p.recipe.שם_מתכון,
          candidates: [{ productId: p.productId, productName: p.productName, matchType: p.matchType }],
        } as unknown as ReviewRow);
      } else {
        safe.push({
          recipeId: p.recipe.id,
          recipeName: p.recipe.שם_מתכון,
          productId: p.productId,
          productName: p.productName,
          matchType: p.matchType,
        });
      }
    } else if (p.status === 'review' && p.candidates) {
      review.push({ recipeId: p.recipe.id, recipeName: p.recipe.שם_מתכון, candidates: p.candidates });
    } else {
      unmatched.push({ recipeId: p.recipe.id, recipeName: p.recipe.שם_מתכון });
    }
  }

  // Safe log: counts only, no recipe/product names.
  console.log('[recipes/auto-link/preview]',
    'unlinkedRecipes:', recipes.length,
    '| activeProducts:', products.length,
    '| safe:', safe.length,
    '| review:', review.length,
    '| unmatched:', unmatched.length,
  );

  return NextResponse.json({
    safe,
    review,
    unmatched,
    totals: {
      unlinkedRecipes: recipes.length,
      activeProducts: products.length,
      safe: safe.length,
      review: review.length,
      unmatched: unmatched.length,
    },
  });
}
