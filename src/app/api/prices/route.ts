export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

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
