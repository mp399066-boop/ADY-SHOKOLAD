export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// PATCH — silently updates a draft order's fields and items.
// No emails, no Morning, no delivery/payment records. Status stays 'טיוטה'.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const orderId = params.id;

  const { data: existing } = await supabase
    .from('הזמנות')
    .select('סטטוס_הזמנה')
    .eq('id', orderId)
    .single();

  if (!existing || existing.סטטוס_הזמנה !== 'טיוטה') {
    return NextResponse.json({ error: 'הזמנה אינה טיוטה' }, { status: 400 });
  }

  const body = await req.json();
  const { הזמנה, מוצרים = [], מארזי_פטיפורים = [] } = body;

  let subtotal = 0;
  for (const item of מוצרים) subtotal += (item.כמות || 1) * (item.מחיר_ליחידה || 0);
  for (const pkg of מארזי_פטיפורים) subtotal += (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0);

  const discountType: 'ללא' | 'אחוז' | 'סכום' = הזמנה?.סוג_הנחה || 'ללא';
  const discountValue = Number(הזמנה?.ערך_הנחה || 0);
  let discount = 0;
  if (discountType === 'אחוז') discount = +(subtotal * discountValue / 100).toFixed(2);
  else if (discountType === 'סכום') discount = Math.min(subtotal, discountValue);
  const shipping = הזמנה?.דמי_משלוח || 0;
  const total = Math.max(0, subtotal - discount + shipping);

  await supabase.from('הזמנות').update({
    סטטוס_הזמנה: 'טיוטה',
    הזמנה_דחופה: הזמנה?.הזמנה_דחופה ?? false,
    תאריך_אספקה: הזמנה?.תאריך_אספקה ?? null,
    שעת_אספקה: הזמנה?.שעת_אספקה ?? null,
    delivery_time_flexible: הזמנה?.delivery_time_flexible === true,
    סוג_אספקה: הזמנה?.סוג_אספקה ?? 'איסוף עצמי',
    שם_מקבל: הזמנה?.שם_מקבל ?? null,
    טלפון_מקבל: הזמנה?.טלפון_מקבל ?? null,
    כתובת_מקבל_ההזמנה: הזמנה?.כתובת_מקבל_ההזמנה ?? null,
    עיר: הזמנה?.עיר ?? null,
    הוראות_משלוח: הזמנה?.הוראות_משלוח ?? null,
    דמי_משלוח: shipping,
    delivery_recipient_type: הזמנה?.delivery_recipient_type ?? null,
    סוג_הזמנה: הזמנה?.סוג_הזמנה ?? 'רגיל',
    אופן_תשלום: הזמנה?.אופן_תשלום ?? null,
    סטטוס_תשלום: הזמנה?.סטטוס_תשלום ?? 'ממתין',
    סוג_הנחה: discountType,
    ערך_הנחה: discountValue,
    סכום_לפני_הנחה: subtotal,
    סכום_הנחה: discount,
    סך_הכל_לתשלום: total,
    מקור_ההזמנה: הזמנה?.מקור_ההזמנה ?? null,
    ברכה_טקסט: הזמנה?.ברכה_טקסט ?? null,
    הערות_להזמנה: הזמנה?.הערות_להזמנה ?? null,
    תאריך_עדכון: new Date().toISOString(),
  }).eq('id', orderId);

  await supabase.from('מוצרים_בהזמנה').delete().eq('הזמנה_id', orderId);

  for (const item of מוצרים) {
    await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: orderId,
      מוצר_id: item.מוצר_id || null,
      סוג_שורה: 'מוצר',
      כמות: item.כמות || 1,
      מחיר_ליחידה: item.מחיר_ליחידה || 0,
      סהכ: (item.כמות || 1) * (item.מחיר_ליחידה || 0),
      הערות_לשורה: item.הערות_לשורה || null,
    });
  }

  for (const pkg of מארזי_פטיפורים) {
    const { data: pkgRow } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: orderId,
      מוצר_id: null,
      סוג_שורה: 'מארז',
      גודל_מארז: pkg.גודל_מארז || null,
      כמות: pkg.כמות || 1,
      מחיר_ליחידה: pkg.מחיר_ליחידה || 0,
      סהכ: (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0),
      הערות_לשורה: pkg.הערות_לשורה || null,
    }).select().single();

    if (pkg.פטיפורים && pkgRow) {
      for (const pf of pkg.פטיפורים) {
        await supabase.from('בחירת_פטיפורים_בהזמנה').insert({
          שורת_הזמנה_id: pkgRow.id,
          פטיפור_id: pf.פטיפור_id,
          כמות: pf.כמות || 1,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
