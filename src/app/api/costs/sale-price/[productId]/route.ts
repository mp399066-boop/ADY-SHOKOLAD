export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { salePriceSchema } from '@/lib/product-costs-schema';

// PATCH /api/costs/sale-price/:productId { מחיר } → sets a catalog product's
// sale price from the /costs page. Writes the product's base price AND its
// active retail price-list rows (when it has any), so the costs page and the
// new-order form keep showing the same price.

export async function PATCH(req: NextRequest, props: { params: Promise<{ productId: string }> }) {
  const params = await props.params;
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!z.string().uuid().safeParse(params.productId).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = salePriceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'מחיר לא תקין' }, { status: 400 });
  const price = parsed.data.מחיר;
  const now = new Date().toISOString();

  const supabase = createAdminClient();
  const { data: product, error } = await supabase
    .from('מוצרים_למכירה')
    .update({ מחיר: price, תאריך_עדכון: now })
    .eq('id', params.productId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[costs sale-price PATCH product]', { id: params.productId, code: error.code });
    return NextResponse.json({ error: 'עדכון מחיר המכירה נכשל' }, { status: 500 });
  }
  if (!product) return NextResponse.json({ error: 'המוצר לא נמצא בקטלוג' }, { status: 404 });

  const { error: listError } = await supabase
    .from('מחירון')
    .update({ מחיר: price, תאריך_עדכון: now })
    .eq('מוצר_id', params.productId)
    .eq('price_type', 'retail')
    .eq('פעיל', true);
  if (listError) {
    console.error('[costs sale-price PATCH price list]', { id: params.productId, code: listError.code });
    return NextResponse.json({ error: 'מחיר הבסיס עודכן, אך עדכון המחירון נכשל' }, { status: 500 });
  }

  return NextResponse.json({ data: { id: params.productId, price } });
}
