import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { isServiceEnabled, logServiceRun, SERVICE_DISABLED_MESSAGE } from '@/lib/system-services';

const PAYPLUS_API_URL = process.env.PAYPLUS_API_URL || 'https://restapi.payplus.co.il';
const PAYPLUS_API_KEY = process.env.PAYPLUS_API_KEY;
const PAYPLUS_SECRET_KEY = process.env.PAYPLUS_SECRET_KEY;
// Accept either env-var name. PAYPLUS_PAYMENT_PAGE_UID is the canonical
// one going forward; PAYPLUS_PAGE_UID is kept as a fallback so existing
// Vercel deployments keep working without manual rename.
const PAYPLUS_PAGE_UID = process.env.PAYPLUS_PAYMENT_PAGE_UID || process.env.PAYPLUS_PAGE_UID;

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
      const missing = [
        !PAYPLUS_API_KEY    && 'PAYPLUS_API_KEY',
        !PAYPLUS_SECRET_KEY && 'PAYPLUS_SECRET_KEY',
        !PAYPLUS_PAGE_UID   && 'PAYPLUS_PAYMENT_PAGE_UID',
      ].filter(Boolean).join(', ');
      console.error('[create-payment-link] aborting — missing env vars:', missing);
      // Return the missing-var names in the response so the operator can
      // see exactly what's not set in Vercel without opening function logs.
      // Names only — no values.
      return NextResponse.json(
        { error: `חסרים משתני סביבה ב-Vercel: ${missing}. הגדירו אותם ב-Vercel → Project Settings → Environment Variables ופרסו מחדש.` },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();
    const orderId = params.id;
    console.log('[create-payment-link] order id:', orderId);

    // Control-center kill-switch.
    if (!(await isServiceEnabled(supabase, 'payplus_payments'))) {
      console.log('[create-payment-link] payplus_payments OFF in control center — refusing.');
      await logServiceRun(supabase, {
        serviceKey:  'payplus_payments',
        action:      'create_payment_link',
        status:      'disabled',
        relatedType: 'order',
        relatedId:   orderId,
        message:     'PayPlus link NOT created — service disabled',
      });
      return NextResponse.json({ error: SERVICE_DISABLED_MESSAGE }, { status: 503 });
    }

    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .select('*, לקוחות(שם_פרטי, שם_משפחה, טלפון, אימייל)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
    }

    // Supabase NUMERIC columns can come back as either number or string
    // depending on driver/cache. PayPlus rejects non-numeric `price`
    // (and "₪123" definitely won't pass), so coerce defensively.
    const rawAmount = order.סך_הכל_לתשלום;
    const amountNum = typeof rawAmount === 'number' ? rawAmount : Number(String(rawAmount ?? '').replace(/[^0-9.\-]/g, ''));
    const amount    = Number.isFinite(amountNum) ? Math.round(amountNum * 100) / 100 : 0;
    console.log('[create-payment-link] amount — raw:', rawAmount, '| coerced:', amount, '| type:', typeof rawAmount);
    if (amount <= 0) {
      return NextResponse.json(
        { error: `סכום ההזמנה חייב להיות גדול מ-0 (התקבל: ${JSON.stringify(rawAmount)})` },
        { status: 400 },
      );
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
      // more_info is echoed back in the IPN webhook (transaction.more_info).
      // Carrying our orderId here lets /api/webhooks/payplus look up the
      // order without needing a payment_page_request_uid round-trip.
      more_info: orderId,
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

    // Log endpoint + body (no headers — keys must never appear in logs,
    // not even prefixed). Body intentionally includes customer name/phone/
    // email — those are PII but not credentials, and they're needed when
    // diagnosing why PayPlus rejects a request.
    console.log('[create-payment-link] → URL:', ppEndpoint);
    console.log('[create-payment-link] → page_uid present:', Boolean(PAYPLUS_PAGE_UID), '| amount:', amount, '| currency: ILS');
    console.log('[create-payment-link] → body:', JSON.stringify(ppBody));

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
      const ppResults = ppJson.results as Record<string, unknown> | undefined;
      const ppMessage = (ppResults?.message as string | undefined)
                       || (ppResults?.code    as string | undefined)
                       || `HTTP ${ppRes.status}`;
      console.error('[create-payment-link] PayPlus rejected — HTTP status:', ppRes.status, '| msg:', ppMessage);
      console.error('[create-payment-link] PayPlus raw body (full):', ppRawText);
      // Give the operator a Hebrew-prefixed message that includes the real
      // upstream reason — far more useful than a generic "PayPlus error".
      return NextResponse.json(
        {
          error: `PayPlus דחה את הבקשה: ${ppMessage}`,
          debug: {
            payplus_http_status: ppRes.status,
            payplus_results:     ppJson.results ?? null,
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
