export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { salePriceSchema } from '@/lib/product-costs-schema';
import { missingColumnMessage } from '@/lib/db-error';

// PATCH /api/costs/:id/sale-price { מחיר } → sets the sale price stored on a
// cost row itself (migration 069). Used for rows that are not linked to a
// catalog product (unlinked rows, petit-fours); linked products are priced
// through /api/costs/sale-price/:productId instead.

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = salePriceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'מחיר לא תקין' }, { status: 400 });
  const price = parsed.data.מחיר;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('עלויות_מוצרים')
    .update({ מחיר_מכירה: price, עודכן_על_ידי: auth.email ?? null, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (missingColumnMessage(error)) {
      return NextResponse.json({ error: 'כדי לשמור מחיר מכירה לשורה הזו יש להריץ את מיגרציה 069 (supabase/migrations/069_cost_row_sale_price.sql) ב-Supabase SQL Editor.' }, { status: 400 });
    }
    console.error('[costs row sale-price PATCH]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'עדכון מחיר המכירה נכשל' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'השורה לא נמצאה' }, { status: 404 });
  return NextResponse.json({ data: { id: params.id, price } });
}
