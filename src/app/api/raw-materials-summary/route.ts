import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────

interface OrderRef { מספר_הזמנה: string; id: string; לקוח: string; }

interface SourceRef {
  name: string;
  type: 'מוצר' | 'פטיפור';
  required_qty: number;
}

interface RawMaterialReq {
  חומר_גלם_id: string;
  שם: string;
  required: number;
  in_stock: number;
  missing: number;
  recipe_unit: string;
  stock_unit: string;
  unit_mismatch: boolean;
  sources: SourceRef[];
}

interface NoRecipeItem {
  type: 'מוצר' | 'פטיפור';
  name: string;
  qty: number;
  orders: OrderRef[];
}

const DEFAULT_ACTIVE_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'];

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);

  const dateFrom  = searchParams.get('date_from');
  const dateTo    = searchParams.get('date_to');
  const statusParam = searchParams.get('status');

  const statusList = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_ACTIVE_STATUSES;

  // ── 1. Fetch orders (same join as production-summary) ────────────────────

  let query = supabase
    .from('הזמנות')
    .select(`
      id,
      מספר_הזמנה,
      תאריך_אספקה,
      לקוחות(שם_פרטי, שם_משפחה),
      מוצרים_בהזמנה(
        סוג_שורה,
        מוצר_id,
        כמות,
        מוצרים_למכירה(שם_מוצר),
        בחירת_פטיפורים_בהזמנה(
          כמות,
          פטיפור_id,
          סוגי_פטיפורים(שם_פטיפור)
        )
      )
    `)
    .in('סטטוס_הזמנה', statusList);

  if (dateFrom) query = query.gte('תאריך_אספקה', dateFrom);
  if (dateTo)   query = query.lte('תאריך_אספקה', dateTo);

  const { data: orders, error } = await query.order('תאריך_אספקה', { ascending: true });
  if (error) {
    console.error('[raw-materials-summary] orders query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── 2. Build product-needs and petit-four-needs maps ─────────────────────

  const productNeeds = new Map<string, { name: string; qty: number; orders: OrderRef[] }>();
  const pfNeeds      = new Map<string, { name: string; qty: number; orders: OrderRef[] }>();

  for (const order of (orders as any[]) ?? []) {
    const cust = order.לקוחות as { שם_פרטי?: string; שם_משפחה?: string } | null;
    const custName = `${cust?.שם_פרטי ?? ''} ${cust?.שם_משפחה ?? ''}`.trim();
    const orderRef: OrderRef = { מספר_הזמנה: order.מספר_הזמנה, id: order.id, לקוח: custName };

    for (const item of (order.מוצרים_בהזמנה as any[]) ?? []) {
      const qty = Number(item.כמות) || 0;
      if (qty <= 0) continue;

      if (item.סוג_שורה === 'מוצר' && item.מוצר_id) {
        const name = (item.מוצרים_למכירה as { שם_מוצר?: string } | null)?.שם_מוצר || item.מוצר_id;
        const existing = productNeeds.get(item.מוצר_id);
        if (existing) {
          existing.qty += qty;
          existing.orders.push(orderRef);
        } else {
          productNeeds.set(item.מוצר_id, { name, qty, orders: [orderRef] });
        }
      }

      if (item.סוג_שורה === 'מארז') {
        for (const pf of (item.בחירת_פטיפורים_בהזמנה as any[]) ?? []) {
          const pfQty = Number(pf.כמות) || 0;
          if (pfQty <= 0) continue;
          const pfId   = pf.פטיפור_id as string;
          const pfName = (pf.סוגי_פטיפורים as { שם_פטיפור?: string } | null)?.שם_פטיפור || pfId;
          const existing = pfNeeds.get(pfId);
          if (existing) {
            existing.qty += pfQty;
            if (!existing.orders.find(o => o.id === order.id)) existing.orders.push(orderRef);
          } else {
            pfNeeds.set(pfId, { name: pfName, qty: pfQty, orders: [orderRef] });
          }
        }
      }
    }
  }

  // ── 3. Fetch all recipes with ingredients + stock quantities ─────────────

  const { data: recipeRows, error: recipeErr } = await supabase
    .from('מתכונים')
    .select(`
      id,
      מוצר_id,
      כמות_תוצר,
      רכיבי_מתכון(
        חומר_גלם_id,
        כמות_נדרשת,
        יחידת_מידה,
        מלאי_חומרי_גלם(id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה)
      )
    `);

  if (recipeErr) {
    console.error('[raw-materials-summary] recipes query error:', recipeErr);
    return NextResponse.json({ error: recipeErr.message }, { status: 500 });
  }

  // product_id → recipe details
  type IngRow = { חומר_גלם_id: string; שם: string; כמות_נדרשת: number; recipe_unit: string; stock_qty: number; stock_unit: string };
  type RecipeEntry = { כמות_תוצר: number; ingredients: IngRow[] };
  const productToRecipe = new Map<string, RecipeEntry>();

  for (const recipe of (recipeRows as any[]) ?? []) {
    if (!recipe.מוצר_id) continue;
    const ingredients: IngRow[] = Array.from((recipe.רכיבי_מתכון as any[]) ?? []).map((ing: any) => {
      const rm = ing.מלאי_חומרי_גלם as { id: string; שם_חומר_גלם: string; כמות_במלאי: number; יחידת_מידה: string } | null;
      return {
        חומר_גלם_id: ing.חומר_גלם_id as string,
        שם:          rm?.שם_חומר_גלם || ing.חומר_גלם_id,
        כמות_נדרשת:  Number(ing.כמות_נדרשת) || 0,
        recipe_unit: (ing.יחידת_מידה as string) || '',
        stock_qty:   Number(rm?.כמות_במלאי) || 0,
        stock_unit:  rm?.יחידת_מידה || '',
      };
    });
    productToRecipe.set(recipe.מוצר_id as string, {
      כמות_תוצר: Math.max(1, Number(recipe.כמות_תוצר) || 1),
      ingredients,
    });
  }

  // ── 4. Aggregate raw material requirements ───────────────────────────────

  type ReqEntry = {
    שם: string;
    required: number;
    recipe_unit: string;
    stock_qty: number;
    stock_unit: string;
    sources: SourceRef[];
    unit_conflict: boolean; // set when two ingredients for same RM use different recipe units
  };
  const reqMap = new Map<string, ReqEntry>();
  const noRecipeItems: NoRecipeItem[] = [];

  function accumulateIngredient(rmId: string, ing: IngRow, sourceType: 'מוצר' | 'פטיפור', sourceName: string, neededQty: number) {
    const existing = reqMap.get(rmId);
    if (existing) {
      if (existing.recipe_unit === ing.recipe_unit) {
        existing.required += neededQty;
      } else {
        existing.unit_conflict = true;
      }
      const src = existing.sources.find(s => s.name === sourceName && s.type === sourceType);
      if (src) {
        src.required_qty += neededQty;
      } else {
        existing.sources.push({ name: sourceName, type: sourceType, required_qty: neededQty });
      }
    } else {
      reqMap.set(rmId, {
        שם: ing.שם,
        required: neededQty,
        recipe_unit: ing.recipe_unit,
        stock_qty: ing.stock_qty,
        stock_unit: ing.stock_unit,
        sources: [{ name: sourceName, type: sourceType, required_qty: neededQty }],
        unit_conflict: false,
      });
    }
  }

  // Products with recipes → accumulate; without → noRecipeItems
  for (const [productId, need] of Array.from(productNeeds.entries())) {
    const recipe = productToRecipe.get(productId);
    if (!recipe) {
      noRecipeItems.push({ type: 'מוצר', name: need.name, qty: need.qty, orders: need.orders });
      continue;
    }
    const batches = need.qty / recipe.כמות_תוצר;
    for (const ing of recipe.ingredients) {
      if (!ing.חומר_גלם_id) continue;
      accumulateIngredient(ing.חומר_גלם_id, ing, 'מוצר', need.name, ing.כמות_נדרשת * batches);
    }
  }

  // Petit-four types → no recipe support; always go to noRecipeItems
  for (const [, need] of Array.from(pfNeeds.entries())) {
    noRecipeItems.push({ type: 'פטיפור', name: need.name, qty: need.qty, orders: need.orders });
  }

  // ── 5. Build final result arrays ─────────────────────────────────────────

  const rawMaterials:   RawMaterialReq[] = [];
  const unitMismatch:   RawMaterialReq[] = [];

  for (const [rmId, req] of Array.from(reqMap.entries())) {
    const isMismatch = req.unit_conflict || (
      !!req.recipe_unit && !!req.stock_unit && req.recipe_unit !== req.stock_unit
    );
    const roundedRequired = +req.required.toFixed(4);
    const missing = isMismatch ? 0 : +Math.max(0, req.required - req.stock_qty).toFixed(4);
    const item: RawMaterialReq = {
      חומר_גלם_id: rmId,
      שם: req.שם,
      required: roundedRequired,
      in_stock: req.stock_qty,
      missing,
      recipe_unit: req.recipe_unit,
      stock_unit: req.stock_unit,
      unit_mismatch: isMismatch,
      sources: req.sources.map(s => ({ ...s, required_qty: +s.required_qty.toFixed(4) })),
    };
    if (isMismatch) { unitMismatch.push(item); } else { rawMaterials.push(item); }
  }

  rawMaterials.sort((a, b) => b.missing - a.missing || a.שם.localeCompare(b.שם));
  unitMismatch.sort((a, b) => a.שם.localeCompare(b.שם));
  noRecipeItems.sort((a, b) => b.qty - a.qty);

  return NextResponse.json({
    orders_count: orders?.length ?? 0,
    filters: { date_from: dateFrom, date_to: dateTo, status: statusList },
    raw_materials:    rawMaterials,
    unit_mismatch_items: unitMismatch,
    no_recipe_items:  noRecipeItems,
  });
}
