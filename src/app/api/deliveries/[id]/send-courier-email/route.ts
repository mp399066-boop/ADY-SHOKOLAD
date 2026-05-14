export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';
import {
  buildCourierWhatsAppMessage,
  buildCourierDeliveryEmailHtml,
  COURIER_EMAIL_SUBJECT,
  type CourierItem,
} from '@/lib/courier-notification';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  // 1. Fetch delivery + linked order. Wider select than before — the email
  //    now includes the actual delivery details (recipient, phone, address,
  //    items, notes), not just a generic "open the link" body. Mirrors the
  //    select used by the WhatsApp builder in PATCH /api/deliveries/[id].
  const { data: delivery, error: deliveryError } = await supabase
    .from('משלוחים')
    .select(`
      id, delivery_token, courier_id,
      כתובת, עיר, תאריך_משלוח, שעת_משלוח, הוראות_משלוח,
      הזמנות(id, מספר_הזמנה, שם_מקבל, טלפון_מקבל, כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח, לקוחות(שם_פרטי, שם_משפחה))
    `)
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

  // 4b. Resolve recipient + address + items for the message body. Mirrors
  //     the resolution in PATCH /api/deliveries/[id]: delivery row's address
  //     wins over the order's; recipient name falls back to the customer.
  type OrderJoin = {
    id?: string | null; מספר_הזמנה?: string | null; שם_מקבל?: string | null; טלפון_מקבל?: string | null;
    כתובת_מקבל_ההזמנה?: string | null; עיר?: string | null; הוראות_משלוח?: string | null;
    לקוחות?: { שם_פרטי?: string | null; שם_משפחה?: string | null } | null;
  };
  const order = (delivery as Record<string, unknown>)['הזמנות'] as OrderJoin | null;
  const cust = order?.לקוחות || null;
  const recipientName  = order?.שם_מקבל || (cust ? `${cust.שם_פרטי || ''} ${cust.שם_משפחה || ''}`.trim() : '') || null;
  const recipientPhone = order?.טלפון_מקבל || null;
  const addrStreet     = (delivery as Record<string, unknown>)['כתובת'] as string | null || order?.כתובת_מקבל_ההזמנה || null;
  const addrCity       = (delivery as Record<string, unknown>)['עיר']   as string | null || order?.עיר                  || null;
  const deliveryNotes  = (delivery as Record<string, unknown>)['הוראות_משלוח'] as string | null || order?.הוראות_משלוח || null;
  const deliveryDate   = (delivery as Record<string, unknown>)['תאריך_משלוח'] as string | null;
  const deliveryTime   = (delivery as Record<string, unknown>)['שעת_משלוח']   as string | null;

  // 4c. Order items — best-effort. Failure here only degrades the message
  //     ("open the link" without an items list); never blocks the email.
  let courierItems: CourierItem[] = [];
  if (order?.id) {
    try {
      const { data: itemsData } = await supabase
        .from('מוצרים_בהזמנה')
        .select('id, סוג_שורה, גודל_מארז, כמות, הערות_לשורה, מוצרים_למכירה(שם_מוצר), בחירת_פטיפורים_בהזמנה(כמות, סוגי_פטיפורים(שם_פטיפור))')
        .eq('הזמנה_id', order.id);
      type ItemRow = {
        סוג_שורה: string | null; גודל_מארז: number | null; כמות: number | null; הערות_לשורה: string | null;
        מוצרים_למכירה?: { שם_מוצר?: string | null } | null;
        בחירת_פטיפורים_בהזמנה?: Array<{ כמות: number | null; סוגי_פטיפורים?: { שם_פטיפור?: string | null } | null }> | null;
      };
      courierItems = ((itemsData || []) as unknown as ItemRow[]).map(it => {
        const isPackage = it.סוג_שורה === 'מארז';
        const name = isPackage
          ? `מארז ${it.גודל_מארז ?? ''} פטיפורים`.trim()
          : (it.מוצרים_למכירה?.שם_מוצר || 'פריט');
        const petitFours = (it.בחירת_פטיפורים_בהזמנה || [])
          .map(s => ({ name: s.סוגי_פטיפורים?.שם_פטיפור || '', quantity: Number(s.כמות || 0) }))
          .filter(p => p.name && p.quantity > 0);
        return { name, quantity: Number(it.כמות || 1), ...(petitFours.length > 0 ? { petitFours } : {}) };
      });
    } catch (err) {
      console.warn('[send-courier-email] items fetch failed (continuing):', err instanceof Error ? err.message : err);
    }
  }

  // 5. Build email content via the shared helper. Same source as the
  //    WhatsApp builder + the manual UI flow — all three render identical
  //    details from one place. NO greeting, NO courier name.
  const details = {
    recipientName, recipientPhone,
    addressStreet: addrStreet, addressCity: addrCity,
    deliveryDate,  deliveryTime,
    orderNumber:   order?.מספר_הזמנה || null,
    items:         courierItems,
    deliveryNotes,
  };
  const subject     = COURIER_EMAIL_SUBJECT;
  const textContent = buildCourierWhatsAppMessage({ ...details, deliveryUpdateUrl: link });
  const htmlContent = buildCourierDeliveryEmailHtml({ ...details, deliveryUpdateUrl: link });

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
