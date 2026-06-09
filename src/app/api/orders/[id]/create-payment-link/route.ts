import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import { createPayPlusPaymentLink, payplusConfigStatus } from '@/lib/payplus';

// CRM → PayPlus DIRECT payment-link flow.
//
// This route creates a DIRECT PayPlus hosted payment-page link for a CRM
// order using the PayPlus REST API (PaymentPages/generateLink). The customer
// is sent straight to PayPlus (payments.payplus.co.il) — NOT through a
// WooCommerce /checkout/order-pay/ URL on adipatifur.co.il.
//
// What this route DOES:
//   1. Reads the CRM order + customer.
//   2. Calls PayPlus generateLink with the CRM-computed total (source of truth).
//   3. Returns the direct PayPlus payment_page_link to the client.
//   4. Records the channel + URL on the CRM side
//      (אופן_תשלום='PayPlus', a 'ממתין' תשלומים row carrying the PayPlus link
//       and the page_request_uid for reconciliation).
//
// What this route does NOT do (intentional):
//   - mark הזמנות.סטטוס_תשלום as שולם (operator confirms manually on the
//     order card — same as before)
//   - issue invoices/receipts
//   - deduct inventory
//
// NOTE on status updates: because the customer now pays PayPlus directly (no
// WooCommerce order is created for CRM-initiated links), the WooCommerce
// webhook will NOT fire for these payments, so the CRM order is not
// auto-flipped to שולם here — confirmation stays MANUAL. The WooCommerce
// webhook (/api/webhooks/woocommerce-order) is left untouched and still
// handles true website orders + their PayPlus-via-WooCommerce payments.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const orderId = params.id;

  try {
    console.log('[PayPlus payment-link] route called', { orderId, provider: 'PayPlus-direct' });

    // Presence-only check — never logs the secret values themselves.
    const cfg = payplusConfigStatus();
    console.log('[PayPlus payment-link] env exists', {
      apiKey:  Boolean(process.env.PAYPLUS_API_KEY),
      secret:  Boolean(process.env.PAYPLUS_SECRET_KEY),
      pageUid: Boolean(process.env.PAYPLUS_PAGE_UID),
      apiUrl:  Boolean(process.env.PAYPLUS_API_URL),
    });
    if (!cfg.ok) {
      console.error('[PayPlus payment-link] aborting — missing env vars:', cfg.missing.join(', '));
      return NextResponse.json(
        { error: `חסרים משתני סביבה של PayPlus ב-Vercel: ${cfg.missing.join(', ')}. הגדירו אותם ב-Vercel → Project Settings → Environment Variables ופרסו מחדש.` },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();

    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, סך_הכל_לתשלום, סטטוס_תשלום, אופן_תשלום, לקוחות(שם_פרטי, שם_משפחה, טלפון, אימייל)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error('[PayPlus payment-link] order not found:', orderErr?.message);
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
    }

    // Coerce amount — Supabase NUMERIC can return a string. The CRM total is
    // the only authority for the payable amount (VAT, discounts, delivery,
    // tier pricing already baked in). PayPlus charges exactly this number.
    const rawAmount = order.סך_הכל_לתשלום;
    const amountNum = typeof rawAmount === 'number'
      ? rawAmount
      : Number(String(rawAmount ?? '').replace(/[^0-9.\-]/g, ''));
    const amount    = Number.isFinite(amountNum) ? Math.round(amountNum * 100) / 100 : 0;
    console.log('[PayPlus payment-link] amount — raw:', rawAmount, '| coerced:', amount);
    if (amount <= 0) {
      return NextResponse.json(
        { error: `סכום ההזמנה חייב להיות גדול מ-0 (התקבל: ${JSON.stringify(rawAmount)})` },
        { status: 400 },
      );
    }

    const customer = order.לקוחות as {
      שם_פרטי?: string | null;
      שם_משפחה?: string | null;
      טלפון?:   string | null;
      אימייל?:  string | null;
    } | null;
    const customerName = `${(customer?.שם_פרטי || '').trim()} ${(customer?.שם_משפחה || '').trim()}`.trim();

    // ── Create the direct PayPlus payment-page link ───────────────────────────
    const result = await createPayPlusPaymentLink({
      amount,
      orderNumber: String(order.מספר_הזמנה || orderId),
      customer: {
        name:  customerName,
        email: customer?.אימייל ?? null,
        phone: customer?.טלפון  ?? null,
      },
    });

    if (!result.ok) {
      console.error(
        '[PayPlus payment-link] PayPlus rejected — provider: PayPlus-direct | http:',
        result.httpStatus ?? null, '| code:', result.code ?? null, '| error:', result.error,
      );
      void logActivity({
        actor:        userActor(auth),
        module:       'finance',
        action:       'payment_link_failed',
        status:       'failed',
        entityType:   'order',
        entityId:     String(orderId),
        entityLabel:  order.מספר_הזמנה ? String(order.מספר_הזמנה) : null,
        title:        'יצירת קישור תשלום נכשלה',
        description:  result.error,
        errorMessage: `PayPlus${result.httpStatus ? ' · HTTP ' + result.httpStatus : ''}${result.code != null ? ' · code ' + result.code : ''}`,
        metadata:     { provider: 'PayPlus', http_status: result.httpStatus ?? null, code: result.code ?? null },
        serviceKey:   'payplus_payments',
        request:      req,
      });
      return NextResponse.json(
        {
          error: result.error,
          debug: { provider: 'PayPlus', http_status: result.httpStatus ?? null, code: result.code ?? null },
        },
        { status: 502 },
      );
    }

    const payment_url = result.payment_url;

    // Explicit provider/host/order logging so Vercel logs show exactly which
    // provider generated the link and which domain the customer will hit.
    console.log(
      '[PayPlus payment-link] success — provider: PayPlus-direct | host:', result.host,
      '| order:', orderId, '| order_number:', order.מספר_הזמנה,
      '| page_request_uid:', result.page_request_uid,
      '| payment_url:', payment_url,
    );

    // Stamp the CRM side: channel + a 'ממתין' payment row carrying the direct
    // PayPlus URL. סטטוס_תשלום on the order stays as-is (manual confirmation).
    await supabase
      .from('הזמנות')
      .update({ אופן_תשלום: 'PayPlus', תאריך_עדכון: new Date().toISOString() })
      .eq('id', orderId);

    await supabase.from('תשלומים').insert({
      הזמנה_id:     orderId,
      סכום:         amount,
      אמצעי_תשלום:  'PayPlus',
      סטטוס_תשלום:  'ממתין',
      תאריך_תשלום:  new Date().toISOString(),
      קישור_תשלום:  payment_url,
      הערות:        result.page_request_uid ? `payplus_page_request_uid:${result.page_request_uid}` : null,
    });

    void logActivity({
      actor:        userActor(auth),
      module:       'finance',
      action:       'payment_link_created',
      status:       'success',
      entityType:   'order',
      entityId:     String(orderId),
      entityLabel:  order.מספר_הזמנה ? String(order.מספר_הזמנה) : null,
      title:        'נוצר קישור תשלום',
      description:  `נוצר קישור תשלום ישיר ב-PayPlus עבור הזמנה ${order.מספר_הזמנה || orderId}`,
      metadata: {
        provider:         'PayPlus',
        host:             result.host,
        crm_amount:       amount,
        page_request_uid: result.page_request_uid,
      },
      serviceKey: 'payplus_payments',
      request: req,
    });

    return NextResponse.json({
      ok: true,
      provider:         'PayPlus',
      payment_url,
      host:             result.host,
      page_request_uid: result.page_request_uid,
      crm_amount:       amount,
    });
  } catch (err) {
    console.error('[PayPlus payment-link] unexpected error:', err);
    void logActivity({
      actor:        userActor(auth),
      module:       'finance',
      action:       'payment_link_failed',
      status:       'failed',
      entityType:   'order',
      entityId:     String(orderId),
      title:        'יצירת קישור תשלום נכשלה',
      description:  'אירעה שגיאה בלתי צפויה ביצירת קישור התשלום מול PayPlus',
      errorMessage: err instanceof Error ? err.message : String(err),
      serviceKey:   'payplus_payments',
      request:      req,
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
