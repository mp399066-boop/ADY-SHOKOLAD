import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const PAYPLUS_API_URL = process.env.PAYPLUS_API_URL || 'https://restapi.payplus.co.il';
const PAYPLUS_API_KEY = process.env.PAYPLUS_API_KEY;
const PAYPLUS_SECRET_KEY = process.env.PAYPLUS_SECRET_KEY;
const PAYPLUS_PAGE_UID = process.env.PAYPLUS_PAGE_UID;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    console.log('[create-payment-link] called');
    console.log('[create-payment-link] env check — API_KEY:', PAYPLUS_API_KEY ? 'SET' : 'MISSING', '| SECRET_KEY:', PAYPLUS_SECRET_KEY ? 'SET' : 'MISSING', '| PAGE_UID:', PAYPLUS_PAGE_UID ? 'SET' : 'MISSING');

    if (!PAYPLUS_API_KEY || !PAYPLUS_SECRET_KEY || !PAYPLUS_PAGE_UID) {
      console.error('[create-payment-link] aborting — missing env vars');
      return NextResponse.json(
        { error: 'חסרים פרטי PayPlus — יש להגדיר PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY, PAYPLUS_PAGE_UID' },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();
    const orderId = params.id;
    console.log('[create-payment-link] order id:', orderId);

    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .select('*, לקוחות(שם_פרטי, שם_משפחה, טלפון, אימייל)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
    }

    const amount = order.סך_הכל_לתשלום || 0;
    if (amount <= 0) {
      return NextResponse.json({ error: 'סכום ההזמנה חייב להיות גדול מ-0' }, { status: 400 });
    }

    const customer = order.לקוחות as {
      שם_פרטי: string;
      שם_משפחה: string;
      טלפון: string | null;
      אימייל: string | null;
    } | null;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000';

    const ppBody = {
      payment_page_uid: PAYPLUS_PAGE_UID,
      refURL_success: `${baseUrl}/orders/${orderId}?payment=success`,
      refURL_failure: `${baseUrl}/orders/${orderId}?payment=failure`,
      refURL_callback: `${baseUrl}/api/webhooks/payplus`,
      charge_method: 1,
      currency_code: 'ILS',
      sendEmailApproval: false,
      sendEmailFailure: false,
      full_payment: true,
      payments: 1,
      customer: {
        customer_name: customer
          ? `${customer.שם_פרטי} ${customer.שם_משפחה}`
          : 'לקוח',
        email: customer?.אימייל || '',
        phone: customer?.טלפון || '',
        notify_by_email: false,
        notify_by_sms: false,
        send_url_by_email: false,
        send_url_by_sms: false,
      },
      items: [
        {
          name: `הזמנה ${order.מספר_הזמנה}`,
          quantity: 1,
          price: amount,
          vatType: 0,
        },
      ],
    };

    const ppEndpoint = `${PAYPLUS_API_URL}/api/v1.0/PaymentPages/generateLink`;

    console.log('[create-payment-link] → URL:', ppEndpoint);
    console.log('[create-payment-link] → headers:', {
      'api-key': PAYPLUS_API_KEY ? `${PAYPLUS_API_KEY.slice(0, 6)}...` : 'MISSING',
      'secret-key': PAYPLUS_SECRET_KEY ? '***' : 'MISSING',
      'Content-Type': 'application/json',
    });
    console.log('[create-payment-link] → body:', JSON.stringify(ppBody, null, 2));

    const ppRes = await fetch(ppEndpoint, {
      method: 'POST',
      headers: {
        'api-key': PAYPLUS_API_KEY,
        'secret-key': PAYPLUS_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ppBody),
    });

    const ppRawText = await ppRes.text();
    console.log('[create-payment-link] ← status:', ppRes.status);
    console.log('[create-payment-link] ← body:', ppRawText);

    let ppJson: Record<string, unknown>;
    try {
      ppJson = JSON.parse(ppRawText);
    } catch {
      console.error('[create-payment-link] PayPlus returned non-JSON:', ppRawText);
      return NextResponse.json(
        { error: `PayPlus returned non-JSON (HTTP ${ppRes.status}): ${ppRawText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const resultsStatus = (ppJson.results as Record<string, unknown>)?.status;
    const isSuccess = ppRes.ok && (resultsStatus === '1' || resultsStatus === 1);

    if (!isSuccess) {
      const ppMessage = (ppJson.results as Record<string, unknown>)?.message as string | undefined;
      console.error('[create-payment-link] PayPlus rejected — HTTP status:', ppRes.status);
      console.error('[create-payment-link] PayPlus raw body (full):', ppRawText);
      console.error('[create-payment-link] PayPlus parsed results:', JSON.stringify(ppJson.results ?? null));
      console.error('[create-payment-link] PayPlus parsed data:', JSON.stringify(ppJson.data ?? null));
      return NextResponse.json(
        {
          error: ppMessage || `PayPlus error (HTTP ${ppRes.status})`,
          debug: {
            payplus_http_status: ppRes.status,
            payplus_raw_body: ppRawText,
            payplus_results: ppJson.results ?? null,
            payplus_data: ppJson.data ?? null,
          },
        },
        { status: 502 },
      );
    }

    const ppData = ppJson.data as Record<string, unknown> | undefined;
    const payment_url = ppData?.payment_page_link as string | undefined;
    const payplus_uid = ppData?.payment_page_uid as string | undefined;

    console.log('[create-payment-link] ← payment_url:', payment_url);
    console.log('[create-payment-link] ← payplus_uid:', payplus_uid);

    if (!payment_url) {
      return NextResponse.json(
        { error: 'PayPlus לא החזיר קישור תשלום', payplus_response: ppJson },
        { status: 502 },
      );
    }

    // Update order payment method to PayPlus
    await supabase
      .from('הזמנות')
      .update({ אופן_תשלום: 'PayPlus', תאריך_עדכון: new Date().toISOString() })
      .eq('id', orderId);

    // Insert a payment record with the link (קישור_תשלום field exists on תשלומים table)
    await supabase.from('תשלומים').insert({
      הזמנה_id: orderId,
      סכום: amount,
      אמצעי_תשלום: 'PayPlus',
      סטטוס_תשלום: 'ממתין',
      תאריך_תשלום: new Date().toISOString(),
      קישור_תשלום: payment_url,
      הערות: payplus_uid ? `payplus_uid:${payplus_uid}` : null,
    });

    console.log(`[create-payment-link] order ${order.מספר_הזמנה} → ${payment_url}`);
    return NextResponse.json({ payment_url, payplus_uid });
  } catch (err) {
    console.error('[create-payment-link] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
