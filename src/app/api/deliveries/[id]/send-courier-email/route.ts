export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';
import {
  buildCourierDeliveryMessage,
  buildCourierDeliveryEmailHtml,
  COURIER_EMAIL_SUBJECT,
} from '@/lib/courier-notification';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  // 1. Fetch delivery (just the fields the email needs — no recipient/customer
  //    names, those go on the link page, not the email body).
  const { data: delivery, error: deliveryError } = await supabase
    .from('משלוחים')
    .select('id, delivery_token, courier_id')
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

  // 5. Build email content via the shared helper. WhatsApp + email cannot
  //    drift apart now — both render the same neutral wording from the
  //    same source. NO greeting, NO courier name, link is the only action.
  const subject = COURIER_EMAIL_SUBJECT;
  const textContent = buildCourierDeliveryMessage({ deliveryUpdateUrl: link });
  const htmlContent = buildCourierDeliveryEmailHtml({ deliveryUpdateUrl: link });

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
