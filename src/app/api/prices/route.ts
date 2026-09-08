export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';

const VALID_PRICE_TYPES = ['retail', 'retail_quantity', 'business_fixed', 'business_quantity'] as const;
type PriceType = typeof VALID_PRICE_TYPES[number];
const QUANTITY_TIERS: PriceType[] = ['retail_quantity', 'business_quantity'];

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const manage = searchParams.get('manage') === '1';
  const diagnostics = searchParams.get('diagnostics') === '1';

  if (diagnostics) {
    const [{ count: productCount }, { data: priceTypeCounts }] = await Promise.all([
      supabase.from('מוצרים_למכירה').select('*', { count: 'exact', head: true }),
      supabase.from('מחירון').select('price_type').eq('פעיל', true),
    ]);
    const byType: Record<string, number> = {};
    for (const r of priceTypeCounts || []) {
      const t = r.price_type ?? 'null';
      byType[t] = (byType[t] ?? 0) + 1;
    }
    return NextResponse.json({
      totalProducts: productCount ?? 0,
      activePricesByType: byType,
      business_quantity: byType['business_quantity'] ?? 0,
      business_fixed: byType['business_fixed'] ?? 0,
      retail: byType['retail'] ?? 0,
      retail_quantity: byType['retail_quantity'] ?? 0,
    });
  }

  if (manage) {
    // Full management view — all records, all fields, with product name join
    const { data, error } = await supabase
      .from('מחירון')
      .select('*, מוצרים_למכירה(שם_מוצר)')
      .order('price_type')
      .order('product_name_snapshot');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  }

  // Order-form view — active only, minimal fields (used by new order page)
  const { data, error } = await supabase
    .from('מחירון')
    .select('id, מוצר_id, price_type, מחיר, min_quantity, includes_vat')
    .eq('פעיל', true)
    .order('price_type');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

// Create a single new price-list row. This is the manual counterpart to the
// Excel bulk-import flow — lets an admin add a price for a product that has
// no מחירון row yet without having to build a spreadsheet. Same permission
// level as PATCH (admin-only) since price changes are business-sensitive.
export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  const productId = typeof body['מוצר_id'] === 'string' ? body['מוצר_id'] : null;
  const priceType = body.price_type;
  const price = Number(body['מחיר']);
  const includesVat = body.includes_vat !== false; // default true
  let minQuantity: number | null = body.min_quantity === null || body.min_quantity === undefined
    ? null
    : Number(body.min_quantity);

  if (!productId) {
    return NextResponse.json({ error: 'יש לבחור מוצר' }, { status: 400 });
  }
  if (!VALID_PRICE_TYPES.includes(priceType)) {
    return NextResponse.json({ error: 'סוג מחירון לא תקין' }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'מחיר לא תקין' }, { status: 400 });
  }
  const isQuantityTier = QUANTITY_TIERS.includes(priceType as PriceType);
  if (isQuantityTier) {
    if (!Number.isFinite(minQuantity as number) || (minQuantity as number) < 1) {
      return NextResponse.json({ error: 'יש להזין כמות מינימלית תקינה עבור מחירון כמות' }, { status: 400 });
    }
  } else {
    // Fixed/retail tiers never carry a minimum-quantity threshold.
    minQuantity = null;
  }

  const supabase = createAdminClient();

  // Confirm the product actually exists — never trust a client-supplied id blindly.
  const { data: product, error: productErr } = await supabase
    .from('מוצרים_למכירה')
    .select('id, שם_מוצר, sku')
    .eq('id', productId)
    .maybeSingle();
  if (productErr) return NextResponse.json({ error: productErr.message }, { status: 500 });
  if (!product) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 });

  // Avoid a confusing duplicate active row for the exact same product/type/tier —
  // point the caller at editing the existing row instead.
  let dupQuery = supabase
    .from('מחירון')
    .select('id')
    .eq('מוצר_id', productId)
    .eq('price_type', priceType)
    .eq('פעיל', true);
  dupQuery = minQuantity === null ? dupQuery.is('min_quantity', null) : dupQuery.eq('min_quantity', minQuantity);
  const { data: existing } = await dupQuery.maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'כבר קיים מחיר פעיל למוצר זה מאותו סוג — ניתן לערוך אותו בטבלה' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('מחירון')
    .insert({
      'מוצר_id': productId,
      sku: product.sku || null,
      product_name_snapshot: product.שם_מוצר,
      price_type: priceType,
      'מחיר': price,
      min_quantity: minQuantity,
      includes_vat: includesVat,
      'פעיל': true,
      'תאריך_עדכון': now,
    })
    .select('*, מוצרים_למכירה(שם_מוצר)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
