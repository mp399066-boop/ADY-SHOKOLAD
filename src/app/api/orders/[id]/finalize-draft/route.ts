export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import sgMail from '@sendgrid/mail';
import { sendOrderEmail, isInternalEmail, type OrderEmailData, type EmailContext } from '@/lib/email';

// Converts a draft order (status=טיוטה) to a real order (status=חדשה).
// Replaces all items, creates delivery/payment records, sends emails.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const orderId = params.id;

  // Verify it's actually a draft
  const { data: existingOrder, error: fetchErr } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', orderId)
    .single();

  if (fetchErr || !existingOrder) {
    return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
  }
  if (existingOrder.סטטוס_הזמנה !== 'טיוטה') {
    return NextResponse.json({ error: 'הזמנה זו אינה טיוטה' }, { status: 400 });
  }

  const body = await req.json();
  const { הזמנה, משלוח, מוצרים = [], מארזי_פטיפורים = [] } = body;

  // 1. Recalculate totals
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

  // 2. Update the order row
  const { error: updateErr } = await supabase
    .from('הזמנות')
    .update({
      סטטוס_הזמנה: 'חדשה',
      הזמנה_דחופה: הזמנה?.הזמנה_דחופה ?? existingOrder.הזמנה_דחופה,
      תאריך_אספקה: הזמנה?.תאריך_אספקה ?? existingOrder.תאריך_אספקה,
      שעת_אספקה: הזמנה?.שעת_אספקה ?? existingOrder.שעת_אספקה,
      סוג_אספקה: הזמנה?.סוג_אספקה ?? existingOrder.סוג_אספקה,
      שם_מקבל: הזמנה?.שם_מקבל ?? existingOrder.שם_מקבל,
      טלפון_מקבל: הזמנה?.טלפון_מקבל ?? existingOrder.טלפון_מקבל,
      כתובת_מקבל_ההזמנה: הזמנה?.כתובת_מקבל_ההזמנה ?? existingOrder.כתובת_מקבל_ההזמנה,
      עיר: הזמנה?.עיר ?? existingOrder.עיר,
      הוראות_משלוח: הזמנה?.הוראות_משלוח ?? existingOrder.הוראות_משלוח,
      דמי_משלוח: shipping,
      delivery_recipient_type: הזמנה?.delivery_recipient_type ?? existingOrder.delivery_recipient_type,
      סוג_הזמנה: הזמנה?.סוג_הזמנה ?? existingOrder.סוג_הזמנה,
      אופן_תשלום: הזמנה?.אופן_תשלום ?? existingOrder.אופן_תשלום,
      סטטוס_תשלום: הזמנה?.סטטוס_תשלום ?? existingOrder.סטטוס_תשלום,
      סוג_הנחה: discountType,
      ערך_הנחה: discountValue,
      סכום_לפני_הנחה: subtotal,
      סכום_הנחה: discount,
      סך_הכל_לתשלום: total,
      מקור_ההזמנה: הזמנה?.מקור_ההזמנה ?? existingOrder.מקור_ההזמנה,
      ברכה_טקסט: הזמנה?.ברכה_טקסט ?? existingOrder.ברכה_טקסט,
      הערות_להזמנה: הזמנה?.הערות_להזמנה ?? existingOrder.הערות_להזמנה,
    })
    .eq('id', orderId);

  if (updateErr) return NextResponse.json({ error: `עדכון הזמנה נכשל: ${updateErr.message}` }, { status: 500 });

  // 3. Replace all items (delete existing, insert new)
  await supabase.from('מוצרים_בהזמנה').delete().eq('הזמנה_id', orderId);

  for (const item of מוצרים) {
    const { error: itemErr } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: orderId,
      מוצר_id: item.מוצר_id || null,
      סוג_שורה: 'מוצר',
      כמות: item.כמות || 1,
      מחיר_ליחידה: item.מחיר_ליחידה || 0,
      סהכ: (item.כמות || 1) * (item.מחיר_ליחידה || 0),
      הערות_לשורה: item.הערות_לשורה || null,
    });
    if (itemErr) return NextResponse.json({ error: `יצירת פריט נכשלה: ${itemErr.message}` }, { status: 500 });
  }

  for (const pkg of מארזי_פטיפורים) {
    const { data: pkgRow, error: pkgErr } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: orderId,
      מוצר_id: null,
      סוג_שורה: 'מארז',
      גודל_מארז: pkg.גודל_מארז || null,
      כמות: pkg.כמות || 1,
      מחיר_ליחידה: pkg.מחיר_ליחידה || 0,
      סהכ: (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0),
      הערות_לשורה: pkg.הערות_לשורה || null,
    }).select().single();
    if (pkgErr) return NextResponse.json({ error: `יצירת מארז נכשל: ${pkgErr.message}` }, { status: 500 });
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

  // 4. Create delivery record if needed
  if (משלוח) {
    const { data: existingDelivery } = await supabase
      .from('משלוחים').select('id').eq('הזמנה_id', orderId).single();
    if (!existingDelivery) {
      await supabase.from('משלוחים').insert({
        הזמנה_id: orderId,
        סטטוס_משלוח: 'נאסף',
        תאריך_משלוח: הזמנה?.תאריך_אספקה || null,
        שעת_משלוח: הזמנה?.שעת_אספקה || null,
        כתובת: משלוח.כתובת || null,
        עיר: משלוח.עיר || null,
        הוראות_משלוח: משלוח.הוראות_משלוח || null,
      });
    }
  }

  // 5. Fetch updated order for response + email
  const { data: fullOrder } = await supabase
    .from('הזמנות').select('*, לקוחות(*)').eq('id', orderId).single();
  const { data: fullItems } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', orderId);

  // 6. Send email (fire-and-forget)
  const emailCustomer = (fullOrder as Record<string, unknown>)?.['לקוחות'] as Record<string, string> | null;
  const emailTo = emailCustomer?.['אימייל'];
  const emailName = emailCustomer ? `${emailCustomer['שם_פרטי'] || ''} ${emailCustomer['שם_משפחה'] || ''}`.trim() : '';

  if (emailTo && !isInternalEmail(emailTo)) {
    const o = fullOrder as Record<string, unknown>;
    const emailOrderData: OrderEmailData = {
      orderNumber: (o['מספר_הזמנה'] as string) || '',
      orderDate: (o['תאריך_הזמנה'] as string) || new Date().toISOString().split('T')[0],
      deliveryDate: (o['תאריך_אספקה'] as string) || null,
      subtotal: Number(o['סכום_לפני_הנחה'] || 0),
      discount: Number(o['סכום_הנחה'] || 0),
      total: Number(o['סך_הכל_לתשלום'] || 0),
      items: (fullItems || []).map((item: Record<string, unknown>) => {
        const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
        const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
        const pfNames = pfSelections?.map(s => {
          const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
          return pf ? `${pf['שם_פטיפור']} ×${s['כמות']}` : '';
        }).filter(Boolean).join(', ');
        const name = item['סוג_שורה'] === 'מארז'
          ? `מארז ${item['גודל_מארז'] || ''} יח׳${pfNames ? ` (${pfNames})` : ''}`
          : (prod?.['שם_מוצר'] as string) || 'פריט';
        return { name, quantity: Number(item['כמות'] || 1), unitPrice: Number(item['מחיר_ליחידה'] || 0), lineTotal: Number(item['סהכ'] || 0) };
      }),
    };
    const emailContext: EmailContext = { customerId: existingOrder.לקוח_id, orderId };
    void (async () => {
      try { await sendOrderEmail(emailTo, emailName, emailOrderData, emailContext); }
      catch (err) { console.error('[finalize-draft] sendOrderEmail failed:', err); }
    })();
  }

  // 7. Admin alert (fire-and-forget)
  void (async () => {
    try {
      const apiKey = process.env.SENDGRID_API_KEY;
      const from = process.env.FROM_EMAIL;
      if (!apiKey || !from) return;
      sgMail.setApiKey(apiKey);
      const o = fullOrder as Record<string, unknown>;
      const cust = (o['לקוחות'] as Record<string, string>) || {};
      const custName = `${cust['שם_פרטי'] || ''} ${cust['שם_משפחה'] || ''}`.trim();
      const orderNum = (o['מספר_הזמנה'] as string) || '';
      await sgMail.send({
        to: 'adi548419927@gmail.com',
        from,
        subject: `הזמנה ${orderNum} אושרה — ${custName || 'לקוח'}`,
        text: `טיוטה הפכה להזמנה: ${orderNum}\nלקוח: ${custName}\nסה"כ: ${Number(o['סך_הכל_לתשלום'] || 0).toFixed(2)} ₪`,
        html: `<div dir="rtl">טיוטה הפכה להזמנה: ${orderNum}<br>לקוח: ${custName}<br>סה"כ: ₪${Number(o['סך_הכל_לתשלום'] || 0).toFixed(2)}</div>`,
      });
    } catch (err) {
      console.error('[finalize-draft] admin alert failed:', err);
    }
  })();

  return NextResponse.json({ data: { ...fullOrder, מוצרים_בהזמנה: fullItems || [] } }, { status: 200 });
}
