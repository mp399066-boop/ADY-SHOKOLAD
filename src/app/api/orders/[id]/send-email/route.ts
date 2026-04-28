export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', params.id)
    .single();

  if (error || !order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*)')
    .eq('הזמנה_id', params.id);

  const customer = (order as Record<string, unknown>).לקוחות as Record<string, string> | null;
  const subject = `סיכום הזמנה ${order.מספר_הזמנה} — עדי תכשיט שוקולד`;
  const to = customer?.אימייל || '';

  const itemsHtml = (items || []).map((item: Record<string, unknown>) => {
    const prod = item.מוצרים_למכירה as Record<string, unknown> | null;
    return `<tr>
      <td style="padding:8px;border:1px solid #ddd">${prod?.שם_מוצר || 'פריט'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${item.כמות}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:left">₪${item.מחיר_ליחידה}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:left">₪${item.סהכ}</td>
    </tr>`;
  }).join('');

  const deliveryRow = order.סוג_אספקה === 'משלוח' && order.כתובת_מקבל_ההזמנה
    ? `<tr><td><strong>כתובת</strong></td><td>${order.כתובת_מקבל_ההזמנה}${order.עיר ? ', ' + order.עיר : ''}</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="font-family:Arial,sans-serif;direction:rtl;color:#2B1A10;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#8B5E34;color:#FAF7F0;padding:20px;border-radius:8px 8px 0 0;text-align:center">
    <h2 style="margin:0">עדי תכשיט שוקולד</h2>
    <p style="margin:6px 0 0">סיכום הזמנה ${order.מספר_הזמנה}</p>
  </div>

  <div style="border:1px solid #EDE0CE;border-top:none;padding:20px;border-radius:0 0 8px 8px">
    <p>שלום ${customer?.שם_פרטי || 'לקוח/ה'} ${customer?.שם_משפחה || ''},</p>
    <p>תודה על הזמנתך! להלן סיכום ההזמנה:</p>

    <h3 style="color:#8B5E34;border-bottom:1px solid #EDE0CE;padding-bottom:6px">פרטי הזמנה</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:6px 8px;color:#9B7A5A;width:40%"><strong>תאריך אספקה</strong></td><td style="padding:6px 8px">${order.תאריך_אספקה || '—'}</td></tr>
      <tr style="background:#FAF7F0"><td style="padding:6px 8px;color:#9B7A5A"><strong>שעת אספקה</strong></td><td style="padding:6px 8px">${order.שעת_אספקה || '—'}</td></tr>
      <tr><td style="padding:6px 8px;color:#9B7A5A"><strong>סוג אספקה</strong></td><td style="padding:6px 8px">${order.סוג_אספקה}</td></tr>
      ${order.שם_מקבל ? `<tr style="background:#FAF7F0"><td style="padding:6px 8px;color:#9B7A5A"><strong>שם מקבל</strong></td><td style="padding:6px 8px">${order.שם_מקבל}</td></tr>` : ''}
      ${deliveryRow}
    </table>

    <h3 style="color:#8B5E34;border-bottom:1px solid #EDE0CE;padding-bottom:6px">פריטי הזמנה</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead>
        <tr style="background:#FAF7F0">
          <th style="padding:8px;border:1px solid #ddd;text-align:right">מוצר</th>
          <th style="padding:8px;border:1px solid #ddd">כמות</th>
          <th style="padding:8px;border:1px solid #ddd">מחיר ליח׳</th>
          <th style="padding:8px;border:1px solid #ddd">סה״כ</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <h3 style="color:#8B5E34;border-bottom:1px solid #EDE0CE;padding-bottom:6px">סיכום כספי</h3>
    <table style="width:280px;border-collapse:collapse;margin-bottom:16px">
      ${order.סכום_הנחה ? `<tr><td style="padding:6px 8px">הנחה</td><td style="padding:6px 8px;color:#DC2626">-₪${order.סכום_הנחה}</td></tr>` : ''}
      ${order.דמי_משלוח ? `<tr style="background:#FAF7F0"><td style="padding:6px 8px">דמי משלוח</td><td style="padding:6px 8px">₪${order.דמי_משלוח}</td></tr>` : ''}
      <tr style="font-weight:bold;background:#FAF7F0"><td style="padding:8px">סה״כ לתשלום</td><td style="padding:8px;color:#2E7D32">₪${order.סך_הכל_לתשלום || 0}</td></tr>
    </table>

    ${order.ברכה_טקסט ? `<div style="background:#FFF8EE;border:1px solid #EDE0CE;padding:12px;border-radius:8px;margin-bottom:16px"><strong>ברכה:</strong> ${order.ברכה_טקסט}</div>` : ''}

    <p style="color:#9B7A5A;font-size:13px">בברכה,<br><strong>עדי תכשיט שוקולד</strong></p>
  </div>
</body>
</html>`;

  // TODO: שלח בפועל כאשר SMTP מוגדר:
  // if (process.env.SMTP_HOST) { /* nodemailer/resend */ }

  return NextResponse.json({
    data: { subject, to, html },
    message: to
      ? `תבנית מייל מוכנה לשליחה ל-${to}`
      : 'לא הוגדר אימייל ללקוח. חבר SMTP לשליחה אמיתית.',
  });
}
