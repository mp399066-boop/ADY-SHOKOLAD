export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

function buildEmailHtml(order: Record<string, unknown>, customer: Record<string, string> | null, items: Record<string, unknown>[]): string {
  const deliveryRow = order['סוג_אספקה'] === 'משלוח' && order['כתובת_מקבל_ההזמנה']
    ? `<tr style="background:#FAF7F0"><td style="padding:8px 12px;color:#9B7A5A;width:40%">כתובת</td><td style="padding:8px 12px">${order['כתובת_מקבל_ההזמנה']}${order['עיר'] ? ', ' + order['עיר'] : ''}</td></tr>`
    : '';

  const itemsHtml = items.map((item) => {
    const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
    const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
    const pfNames = pfSelections?.map(s => {
      const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
      return pf ? `${pf['שם_פטיפור']} ×${s['כמות']}` : '';
    }).filter(Boolean).join(', ');

    const name = item['סוג_שורה'] === 'מארז'
      ? `מארז ${item['גודל_מארז'] || ''} יח׳${pfNames ? ` (${pfNames})` : ''}`
      : (prod?.['שם_מוצר'] as string || 'פריט');

    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F0E8D8">${name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0E8D8;text-align:center">${item['כמות']}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0E8D8;text-align:left">₪${Number(item['מחיר_ליחידה']).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F0E8D8;text-align:left;font-weight:600">₪${Number(item['סהכ']).toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><title>סיכום הזמנה ${order['מספר_הזמנה']}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#2B1A10;background:#F5F1EB;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto">

    <div style="background:#7C5230;color:#FAF7F0;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="margin:0;font-size:22px;letter-spacing:0.5px">עדי תכשיט שוקולד</h1>
      <p style="margin:8px 0 0;opacity:0.85;font-size:14px">סיכום הזמנה ${order['מספר_הזמנה']}</p>
    </div>

    <div style="background:#FFFFFF;border:1px solid #EDE0CE;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px">

      <p style="margin:0 0 20px;font-size:15px">
        שלום ${customer?.['שם_פרטי'] || 'לקוח/ה'} ${customer?.['שם_משפחה'] || ''},<br>
        תודה על הזמנתך! להלן פרטי ההזמנה:
      </p>

      <div style="background:#FAF7F0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <h3 style="margin:0 0 12px;color:#7C5230;font-size:14px;border-bottom:1px solid #EDE0CE;padding-bottom:8px">פרטי הזמנה</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 0;color:#9B7A5A;width:40%">תאריך אספקה</td><td style="padding:6px 0;font-weight:600">${order['תאריך_אספקה'] || '—'}</td></tr>
          ${order['שעת_אספקה'] ? `<tr><td style="padding:6px 0;color:#9B7A5A">שעת אספקה</td><td style="padding:6px 0;font-weight:600">${order['שעת_אספקה']}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#9B7A5A">סוג אספקה</td><td style="padding:6px 0">${order['סוג_אספקה']}</td></tr>
          ${order['שם_מקבל'] ? `<tr><td style="padding:6px 0;color:#9B7A5A">שם מקבל</td><td style="padding:6px 0">${order['שם_מקבל']}</td></tr>` : ''}
          ${order['טלפון_מקבל'] ? `<tr><td style="padding:6px 0;color:#9B7A5A">טלפון</td><td style="padding:6px 0">${order['טלפון_מקבל']}</td></tr>` : ''}
          ${deliveryRow}
        </table>
      </div>

      <div style="margin-bottom:20px">
        <h3 style="margin:0 0 12px;color:#7C5230;font-size:14px;border-bottom:1px solid #EDE0CE;padding-bottom:8px">פריטי הזמנה</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#FAF7F0">
              <th style="padding:8px 12px;text-align:right;color:#6B4A2D;font-weight:600">פריט</th>
              <th style="padding:8px 12px;text-align:center;color:#6B4A2D;font-weight:600">כמות</th>
              <th style="padding:8px 12px;text-align:left;color:#6B4A2D;font-weight:600">מחיר ליח׳</th>
              <th style="padding:8px 12px;text-align:left;color:#6B4A2D;font-weight:600">סה״כ</th>
            </tr>
          </thead>
          <tbody>${itemsHtml || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#9B7A5A">אין פריטים</td></tr>'}</tbody>
        </table>
      </div>

      <div style="background:#FAF7F0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <h3 style="margin:0 0 12px;color:#7C5230;font-size:14px;border-bottom:1px solid #EDE0CE;padding-bottom:8px">סיכום כספי</h3>
        <table style="width:100%;max-width:280px;border-collapse:collapse;font-size:13px">
          ${order['סכום_לפני_הנחה'] && Number(order['סכום_לפני_הנחה']) !== Number(order['סך_הכל_לתשלום']) ? `<tr><td style="padding:5px 0;color:#9B7A5A">סכום לפני הנחה</td><td style="padding:5px 0;text-align:left">₪${Number(order['סכום_לפני_הנחה']).toFixed(2)}</td></tr>` : ''}
          ${order['סכום_הנחה'] && Number(order['סכום_הנחה']) > 0 ? `<tr><td style="padding:5px 0;color:#9B7A5A">הנחה</td><td style="padding:5px 0;text-align:left;color:#DC2626">−₪${Number(order['סכום_הנחה']).toFixed(2)}</td></tr>` : ''}
          ${order['דמי_משלוח'] && Number(order['דמי_משלוח']) > 0 ? `<tr><td style="padding:5px 0;color:#9B7A5A">דמי משלוח</td><td style="padding:5px 0;text-align:left">₪${Number(order['דמי_משלוח']).toFixed(2)}</td></tr>` : ''}
          <tr style="border-top:2px solid #EDE0CE"><td style="padding:8px 0;font-weight:700;font-size:14px">סה״כ לתשלום</td><td style="padding:8px 0;text-align:left;font-weight:700;font-size:16px;color:#2E7D32">₪${Number(order['סך_הכל_לתשלום'] || 0).toFixed(2)}</td></tr>
        </table>
      </div>

      ${order['ברכה_טקסט'] ? `<div style="background:#FFF8EE;border:1px solid #EDE0CE;border-radius:8px;padding:14px 18px;margin-bottom:20px"><p style="margin:0;font-size:13px;color:#5C3D22">💝 <em>${order['ברכה_טקסט']}</em></p></div>` : ''}

      <p style="color:#9B7A5A;font-size:12px;margin:0;border-top:1px solid #EDE0CE;padding-top:16px">
        בברכה,<br>
        <strong style="color:#7C5230">עדי תכשיט שוקולד</strong>
      </p>
    </div>
  </div>
</body>
</html>`;
}

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
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', params.id);

  const customer = (order as Record<string, unknown>)['לקוחות'] as Record<string, string> | null;
  const to = customer?.['אימייל'] || '';
  const subject = `סיכום הזמנה ${order['מספר_הזמנה']} — עדי תכשיט שוקולד`;
  const html = buildEmailHtml(order as Record<string, unknown>, customer, (items || []) as Record<string, unknown>[]);

  if (!to) {
    return NextResponse.json({ data: { subject, html }, message: 'ללקוח אין כתובת אימייל — לא נשלח' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      data: { subject, to, html },
      message: 'RESEND_API_KEY לא מוגדר — הגדר אותו ב-Vercel Environment Variables כדי לשלוח מיילים',
    });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const fromAddress = process.env.EMAIL_FROM || 'adi@adi-shokolad.co.il';

    const { error: sendError } = await resend.emails.send({
      from: `עדי תכשיט שוקולד <${fromAddress}>`,
      to,
      subject,
      html,
    });

    if (sendError) throw new Error(sendError.message);

    return NextResponse.json({ data: { subject, to }, message: `מייל נשלח בהצלחה ל-${to}` });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `שגיאה בשליחת מייל: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}` },
      { status: 500 },
    );
  }
}
