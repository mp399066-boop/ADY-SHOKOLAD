export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils';

async function sendOrderEmail(orderId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('הזמנות').select('*, לקוחות(*)').eq('id', orderId).single();
  if (!order) return;

  const customer = (order as Record<string, unknown>)['לקוחות'] as Record<string, string> | null;
  const to = customer?.['אימייל'];
  if (!to) return;

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', orderId);

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const fromAddress = process.env.EMAIL_FROM || 'adi@adi-shokolad.co.il';

  const deliveryRow = order['סוג_אספקה'] === 'משלוח' && order['כתובת_מקבל_ההזמנה']
    ? `<tr style="background:#FAF7F0"><td style="padding:8px 12px;color:#9B7A5A;width:40%">כתובת</td><td style="padding:8px 12px">${order['כתובת_מקבל_ההזמנה']}${order['עיר'] ? ', ' + order['עיר'] : ''}</td></tr>`
    : '';

  const itemsHtml = (items || []).map((item: Record<string, unknown>) => {
    const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
    const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
    const pfNames = pfSelections?.map(s => {
      const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
      return pf ? `${pf['שם_פטיפור']} ×${s['כמות']}` : '';
    }).filter(Boolean).join(', ');
    const name = item['סוג_שורה'] === 'מארז'
      ? `מארז ${item['גודל_מארז'] || ''} יח׳${pfNames ? ` (${pfNames})` : ''}`
      : (prod?.['שם_מוצר'] as string || 'פריט');
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #F0E8D8">${name}</td><td style="padding:8px 12px;border-bottom:1px solid #F0E8D8;text-align:center">${item['כמות']}</td><td style="padding:8px 12px;border-bottom:1px solid #F0E8D8;text-align:left">₪${Number(item['מחיר_ליחידה']).toFixed(2)}</td><td style="padding:8px 12px;border-bottom:1px solid #F0E8D8;font-weight:600;text-align:left">₪${Number(item['סהכ']).toFixed(2)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;direction:rtl;color:#2B1A10;background:#F5F1EB;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#7C5230;color:#FAF7F0;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="margin:0;font-size:22px">עדי תכשיט שוקולד</h1>
      <p style="margin:8px 0 0;opacity:0.85;font-size:14px">סיכום הזמנה ${order['מספר_הזמנה']}</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #EDE0CE;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px">
      <p style="margin:0 0 20px;font-size:15px">שלום ${customer?.['שם_פרטי'] || ''} ${customer?.['שם_משפחה'] || ''},<br>תודה על הזמנתך!</p>
      <div style="background:#FAF7F0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <h3 style="margin:0 0 10px;color:#7C5230;font-size:14px;border-bottom:1px solid #EDE0CE;padding-bottom:8px">פרטי הזמנה</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:5px 0;color:#9B7A5A;width:40%">תאריך אספקה</td><td style="padding:5px 0;font-weight:600">${order['תאריך_אספקה'] || '—'}</td></tr>
          ${order['שעת_אספקה'] ? `<tr><td style="padding:5px 0;color:#9B7A5A">שעת אספקה</td><td style="padding:5px 0;font-weight:600">${order['שעת_אספקה']}</td></tr>` : ''}
          <tr><td style="padding:5px 0;color:#9B7A5A">סוג אספקה</td><td style="padding:5px 0">${order['סוג_אספקה']}</td></tr>
          ${order['שם_מקבל'] ? `<tr><td style="padding:5px 0;color:#9B7A5A">שם מקבל</td><td style="padding:5px 0">${order['שם_מקבל']}</td></tr>` : ''}
          ${order['טלפון_מקבל'] ? `<tr><td style="padding:5px 0;color:#9B7A5A">טלפון</td><td style="padding:5px 0">${order['טלפון_מקבל']}</td></tr>` : ''}
          ${deliveryRow}
        </table>
      </div>
      <div style="margin-bottom:20px">
        <h3 style="margin:0 0 10px;color:#7C5230;font-size:14px;border-bottom:1px solid #EDE0CE;padding-bottom:8px">פריטי הזמנה</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#FAF7F0"><th style="padding:8px 12px;text-align:right;color:#6B4A2D">פריט</th><th style="padding:8px 12px;color:#6B4A2D">כמות</th><th style="padding:8px 12px;color:#6B4A2D">מחיר ליח׳</th><th style="padding:8px 12px;color:#6B4A2D">סה״כ</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
      <div style="background:#FAF7F0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <table style="width:100%;max-width:280px;border-collapse:collapse;font-size:13px">
          ${Number(order['סכום_הנחה']) > 0 ? `<tr><td style="padding:5px 0;color:#9B7A5A">הנחה</td><td style="padding:5px 0;color:#DC2626;text-align:left">−₪${Number(order['סכום_הנחה']).toFixed(2)}</td></tr>` : ''}
          ${Number(order['דמי_משלוח']) > 0 ? `<tr><td style="padding:5px 0;color:#9B7A5A">דמי משלוח</td><td style="padding:5px 0;text-align:left">₪${Number(order['דמי_משלוח']).toFixed(2)}</td></tr>` : ''}
          <tr style="border-top:2px solid #EDE0CE"><td style="padding:8px 0;font-weight:700;font-size:14px">סה״כ לתשלום</td><td style="padding:8px 0;font-weight:700;font-size:16px;color:#2E7D32;text-align:left">₪${Number(order['סך_הכל_לתשלום'] || 0).toFixed(2)}</td></tr>
        </table>
      </div>
      ${order['ברכה_טקסט'] ? `<div style="background:#FFF8EE;border:1px solid #EDE0CE;border-radius:8px;padding:12px 16px;margin-bottom:16px"><p style="margin:0;font-size:13px;color:#5C3D22">💝 <em>${order['ברכה_טקסט']}</em></p></div>` : ''}
      <p style="color:#9B7A5A;font-size:12px;margin:0;border-top:1px solid #EDE0CE;padding-top:16px">בברכה,<br><strong style="color:#7C5230">עדי תכשיט שוקולד</strong></p>
    </div>
  </div>
</body></html>`;

  await resend.emails.send({
    from: `עדי תכשיט שוקולד <${fromAddress}>`,
    to,
    subject: `סיכום הזמנה ${order['מספר_הזמנה']} — עדי תכשיט שוקולד`,
    html,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  const {
    לקוח,
    הזמנה,
    משלוח,
    תשלום,
    מוצרים = [],
    מארזי_פטיפורים = [],
  } = body;

  if (!לקוח) return NextResponse.json({ error: 'פרטי לקוח הם חובה' }, { status: 400 });

  // 1. Find or create customer
  let customerId: string;
  if (לקוח.id) {
    customerId = לקוח.id;
  } else {
    const { data: created, error } = await supabase
      .from('לקוחות')
      .insert(לקוח)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: `יצירת לקוח נכשלה: ${error.message}` }, { status: 500 });
    customerId = created!.id;
  }

  // 2. Calculate totals
  let subtotal = 0;
  for (const item of מוצרים) subtotal += (item.כמות || 1) * (item.מחיר_ליחידה || 0);
  for (const pkg of מארזי_פטיפורים) subtotal += (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0);
  const discount = הזמנה?.סכום_הנחה || 0;
  const shipping = הזמנה?.דמי_משלוח || 0;
  const total = subtotal - discount + shipping;

  // 3. Create order
  const { data: order, error: orderError } = await supabase
    .from('הזמנות')
    .insert({
      מספר_הזמנה: generateOrderNumber(),
      לקוח_id: customerId,
      סטטוס_הזמנה: הזמנה?.סטטוס_הזמנה || 'חדשה',
      הזמנה_דחופה: הזמנה?.הזמנה_דחופה || false,
      תאריך_הזמנה: הזמנה?.תאריך_הזמנה || new Date().toISOString().split('T')[0],
      תאריך_אספקה: הזמנה?.תאריך_אספקה || null,
      שעת_אספקה: הזמנה?.שעת_אספקה || null,
      סוג_אספקה: הזמנה?.סוג_אספקה || 'איסוף עצמי',
      שם_מקבל: הזמנה?.שם_מקבל || null,
      טלפון_מקבל: הזמנה?.טלפון_מקבל || null,
      כתובת_מקבל_ההזמנה: הזמנה?.כתובת_מקבל_ההזמנה || null,
      עיר: הזמנה?.עיר || null,
      הוראות_משלוח: הזמנה?.הוראות_משלוח || null,
      דמי_משלוח: shipping,
      אופן_תשלום: הזמנה?.אופן_תשלום || null,
      סטטוס_תשלום: הזמנה?.סטטוס_תשלום || 'ממתין',
      סכום_לפני_הנחה: subtotal,
      סכום_הנחה: discount,
      סך_הכל_לתשלום: total,
      מקור_ההזמנה: הזמנה?.מקור_ההזמנה || null,
      ברכה_טקסט: הזמנה?.ברכה_טקסט || null,
      הערות_להזמנה: הזמנה?.הערות_להזמנה || null,
    })
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: `יצירת הזמנה נכשלה: ${orderError.message}` }, { status: 500 });

  // 4. Create regular product lines
  for (const item of מוצרים) {
    const { error: itemError } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: order!.id,
      מוצר_id: item.מוצר_id || null,
      סוג_שורה: 'מוצר',
      כמות: item.כמות || 1,
      מחיר_ליחידה: item.מחיר_ליחידה || 0,
      סהכ: (item.כמות || 1) * (item.מחיר_ליחידה || 0),
      הערות_לשורה: item.הערות_לשורה || null,
    });
    if (itemError) return NextResponse.json({ error: `יצירת פריט נכשלה: ${itemError.message}` }, { status: 500 });
  }

  // 5. Create package lines + petit-four selections
  for (const pkg of מארזי_פטיפורים) {
    const { data: pkgRow, error: pkgError } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: order!.id,
      מוצר_id: pkg.מוצר_id || null,
      סוג_שורה: 'מארז',
      גודל_מארז: pkg.גודל_מארז || null,
      כמות: pkg.כמות || 1,
      מחיר_ליחידה: pkg.מחיר_ליחידה || 0,
      סהכ: (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0),
      הערות_לשורה: pkg.הערות_לשורה || null,
    }).select().single();

    if (pkgError) return NextResponse.json({ error: `יצירת מארז נכשלה: ${pkgError.message}` }, { status: 500 });

    if (pkg.פטיפורים && pkgRow) {
      for (const pf of pkg.פטיפורים) {
        const { error: pfError } = await supabase.from('בחירת_פטיפורים_בהזמנה').insert({
          שורת_הזמנה_id: pkgRow.id,
          פטיפור_id: pf.פטיפור_id,
          כמות: pf.כמות || 1,
        });
        if (pfError) return NextResponse.json({ error: `יצירת בחירת פטיפור נכשלה: ${pfError.message}` }, { status: 500 });
      }
    }
  }

  // 6. Create delivery record
  if (משלוח) {
    await supabase.from('משלוחים').insert({
      הזמנה_id: order!.id,
      סטטוס_משלוח: 'ממתין',
      כתובת: משלוח.כתובת || null,
      עיר: משלוח.עיר || null,
      הוראות_משלוח: משלוח.הוראות_משלוח || null,
    });
  }

  // 7. Create payment record
  if (תשלום) {
    await supabase.from('תשלומים').insert({
      הזמנה_id: order!.id,
      סכום: תשלום.סכום || total,
      אמצעי_תשלום: תשלום.אמצעי_תשלום || 'מזומן',
      סטטוס_תשלום: תשלום.סטטוס_תשלום || 'ממתין',
      תאריך_תשלום: תשלום.תאריך_תשלום || new Date().toISOString().split('T')[0],
    });
  }

  const { data: fullOrder } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', order!.id)
    .single();

  const { data: fullItems } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', order!.id);

  // Send order summary email — non-blocking, never fails the order
  void sendOrderEmail(order!.id).catch(() => undefined);

  return NextResponse.json({ data: { ...fullOrder, מוצרים_בהזמנה: fullItems || [] } }, { status: 201 });
}
