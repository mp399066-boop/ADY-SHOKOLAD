export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';

type OrderJoin = {
  שם_מקבל?: string | null;
  לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  // 1. Fetch delivery + order
  const { data: delivery, error: deliveryError } = await supabase
    .from('משלוחים')
    .select('id, delivery_token, courier_id, הזמנות(שם_מקבל, לקוחות(שם_פרטי, שם_משפחה))')
    .eq('id', params.id)
    .single();

  if (deliveryError || !delivery) {
    return NextResponse.json({ error: 'משלוח לא נמצא' }, { status: 404 });
  }

  if (!delivery.courier_id) {
    return NextResponse.json({ error: 'לא שויך שליח למשלוח' }, { status: 400 });
  }

  // 2. Fetch courier email
  const { data: courier, error: courierError } = await supabase
    .from('שליחים')
    .select('שם_שליח, אימייל_שליח')
    .eq('id', delivery.courier_id)
    .single();

  if (courierError || !courier) {
    return NextResponse.json({ error: 'שליח לא נמצא' }, { status: 404 });
  }

  if (!courier.אימייל_שליח) {
    return NextResponse.json({ error: 'אין כתובת אימייל לשליח' }, { status: 400 });
  }

  // 3. Generate or reuse delivery token
  const token = (delivery.delivery_token as string | null) || randomBytes(32).toString('hex');
  if (!delivery.delivery_token) {
    await supabase.from('משלוחים').update({ delivery_token: token }).eq('id', params.id);
  }

  // 4. Build link
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '';
  const link = `${origin}/delivery-update/${token}`;

  // 5. Resolve recipient name
  const order = delivery.הזמנות as OrderJoin | null;
  const recipientName =
    order?.שם_מקבל ||
    (order?.לקוחות ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}` : '') ||
    'לקוח';

  // 6. Build email
  const subject = 'עדכון משלוח';
  const textContent = `היי ${courier.שם_שליח},\nיש לך משלוח למסירה עבור ${recipientName}.\n\nלאחר המסירה, לחץ כאן כדי לעדכן:\n${link}\n\nתודה!`;
  const htmlContent = `
<html dir="rtl">
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;padding:32px 24px;color:#2B1A10;max-width:520px;margin:0 auto">
  <p style="font-size:16px">היי <strong>${courier.שם_שליח}</strong>,</p>
  <p style="font-size:15px">יש לך משלוח למסירה עבור <strong>${recipientName}</strong>.</p>
  <p style="font-size:15px">לאחר המסירה, לחץ כאן כדי לעדכן:</p>
  <p style="margin:28px 0">
    <a href="${link}"
       style="display:inline-block;padding:14px 28px;background:#065F46;color:white;border-radius:10px;text-decoration:none;font-weight:bold;font-size:16px">
      ✓ סמן כנמסר
    </a>
  </p>
  <p style="font-size:15px">תודה!</p>
  <hr style="border:none;border-top:1px solid #E5DDD3;margin:24px 0">
  <p style="color:#9B7A5A;font-size:12px">עדי שוקולד</p>
</body>
</html>`;

  // 7. Send via SendGrid
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.FROM_EMAIL;

  console.log('[send-courier-email] ENV check — SENDGRID_API_KEY:', apiKey ? `set (${apiKey.slice(0, 6)}...)` : 'MISSING');
  console.log('[send-courier-email] ENV check — FROM_EMAIL:', from || 'MISSING');
  console.log('[send-courier-email] to:', courier.אימייל_שליח?.slice(0, 4) + '***', '| subject:', subject);

  if (!apiKey || !from) {
    console.error('[send-courier-email] aborting — missing ENV vars');
    return NextResponse.json({ error: 'שירות המייל אינו מוגדר בשרת (חסר SENDGRID_API_KEY או FROM_EMAIL)' }, { status: 503 });
  }

  try {
    sgMail.setApiKey(apiKey);
    const [sgResponse] = await sgMail.send({
      to:      courier.אימייל_שליח,
      from,
      subject,
      html:    htmlContent,
      text:    textContent,
    });
    console.log('[send-courier-email] SendGrid response status:', sgResponse.statusCode);
  } catch (err: unknown) {
    let msg = err instanceof Error ? err.message : String(err);
    // SendGrid errors carry a response body with the real reason
    if (err && typeof err === 'object' && 'response' in err) {
      const sgErr = err as { response?: { statusCode?: number; body?: unknown } };
      const body = sgErr.response?.body;
      console.error('[send-courier-email] SendGrid error:', sgErr.response?.statusCode, JSON.stringify(body));
      msg += ` | ${JSON.stringify(body)}`;
    } else {
      console.error('[send-courier-email] SendGrid error:', msg);
    }
    return NextResponse.json({ error: `שליחת מייל נכשלה: ${msg}` }, { status: 500 });
  }

  // 8. Persist email_sent_at (and token if newly generated)
  await supabase
    .from('משלוחים')
    .update({ email_sent_at: new Date().toISOString(), delivery_token: token })
    .eq('id', params.id);

  return NextResponse.json({ success: true, token, link });
}
