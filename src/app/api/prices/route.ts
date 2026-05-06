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
