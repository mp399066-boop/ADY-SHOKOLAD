import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// CRM → WooCommerce payment-link bridge.
//
// We do NOT call the PayPlus API. WooCommerce on the public site
// (adipatifur.co.il) already has the PayPlus plugin wired in. The cleanest
// way to take payment is to mirror the CRM order into WooCommerce as a
// pending order and open the order's `payment_url` (the
// /checkout/order-pay/ID/?key=wc_order_xxx URL). The customer's browser
// then runs through the PayPlus form via the WooCommerce checkout.
//
// What this route DOES:
//   1. Reads the CRM order + customer.
//   2. POSTs to ${WOOCOMMERCE_SITE_URL}/wp-json/wc/v3/orders with
//      Basic auth (consumer key + secret), status='pending', billing
//      from the CRM customer, a single line_item carrying the order
//      total, and meta tying the WC order back to the CRM order id.
//   3. Returns the WooCommerce payment_url to the client.
//   4. Records the channel + the URL on the CRM side
//      (אופן_תשלום='WooCommerce', a 'ממתין' תשלומים row).
//
// What this route does NOT do (intentional):
//   - mark הזמנות.סטטוס_תשלום as שולם (operator confirms manually)
//   - issue invoices/receipts via Morning
//   - deduct inventory
//   - send PayPlus credentials anywhere

const WC_URL    = (process.env.WOOCOMMERCE_SITE_URL || '').replace(/\/+$/, '');
const WC_KEY    = process.env.WOOCOMMERCE_CONSUMER_KEY;
const WC_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  try {
    console.log('[WC payment-link] route called', { orderId: params.id });
    console.log('[WC payment-link] env exists', {
      siteUrl:        Boolean(WC_URL),
      consumerKey:    Boolean(WC_KEY),
      consumerSecret: Boolean(WC_SECRET),
    });

    if (!WC_URL || !WC_KEY || !WC_SECRET) {
      const missing = [
        !WC_URL    && 'WOOCOMMERCE_SITE_URL',
        !WC_KEY    && 'WOOCOMMERCE_CONSUMER_KEY',
        !WC_SECRET && 'WOOCOMMERCE_CONSUMER_SECRET',
      ].filter(Boolean).join(', ');
      console.error('[WC payment-link] aborting — missing env vars:', missing);
      return NextResponse.json(
        { error: `חסרים משתני סביבה ב-Vercel: ${missing}. הגדירו אותם ב-Vercel → Project Settings → Environment Variables ופרסו מחדש.` },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();
    const orderId  = params.id;

    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, סך_הכל_לתשלום, סטטוס_תשלום, אופן_תשלום, לקוחות(שם_פרטי, שם_משפחה, טלפון, אימייל)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error('[WC payment-link] order not found:', orderErr?.message);
      return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
    }

    // Coerce amount — Supabase NUMERIC can return string, and WC's REST
    // endpoint expects either a number or a numeric string for line totals.
    const rawAmount = order.סך_הכל_לתשלום;
    const amountNum = typeof rawAmount === 'number'
      ? rawAmount
      : Number(String(rawAmount ?? '').replace(/[^0-9.\-]/g, ''));
    const amount    = Number.isFinite(amountNum) ? Math.round(amountNum * 100) / 100 : 0;
    console.log('[WC payment-link] amount — raw:', rawAmount, '| coerced:', amount);
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

    // Billing block — WC's /orders endpoint only requires billing.email
    // for guest orders if your store enforces it. Keep things minimal but
    // honest; empty fields just go through as "".
    const billing = {
      first_name: (customer?.שם_פרטי  || '').trim(),
      last_name:  (customer?.שם_משפחה || '').trim(),
      email:      (customer?.אימייל   || '').trim(),
      phone:      (customer?.טלפון    || '').trim(),
    };

    // ──────────────────────────────────────────────────────────────────────
    // SOURCE-OF-TRUTH RULE: the CRM is the only authority for the payable
    // amount. `amount` already includes VAT, discounts, delivery fees, and
    // customer-tier pricing — all computed by the CRM and stored on
    // הזמנות.סך_הכל_לתשלום. WooCommerce must NOT recompute any of these.
    //
    // To prevent WC from touching the total we:
    //   • carry the amount via fee_lines (no product → no product-side tax
    //     rules apply) with tax_status='none' and explicit zero tax fields
    //   • DO NOT send any coupon_lines (so WC can't apply discounts)
    //   • DO NOT enable WC's tax-calculation flags on the order
    //   • Mirror the same tax_status='none' on the line_items fallback
    //
    // Optional fallback: if WOOCOMMERCE_PAYMENT_PRODUCT_ID is set, we use
    // a real WC product line_item instead. Useful if the storefront has
    // plugins that enforce a product on every order. Same tax-disabling
    // rules apply on this path.
    // ──────────────────────────────────────────────────────────────────────
    const paymentProductId = Number(process.env.WOOCOMMERCE_PAYMENT_PRODUCT_ID || 0);
    const amountStr = amount.toFixed(2);

    const wcBody: Record<string, unknown> = {
      status:               'pending',
      set_paid:             false,
      currency:             'ILS',
      payment_method:       'payplus-payment-gateway',
      payment_method_title: 'PayPlus',
      billing,
      // No coupons, no discounts — explicit zeros tell WC not to compute.
      discount_total:    '0.00',
      discount_tax:      '0.00',
      shipping_total:    '0.00',
      shipping_tax:      '0.00',
      meta_data: [
        { key: 'crm_order_id',     value: orderId },
        { key: 'crm_order_number', value: String(order.מספר_הזמנה || '') },
        // Explicit flag — the WC webhook uses this (alongside crm_order_id)
        // to know "this is a payment shell for an existing CRM order, do
        // NOT create a new הזמנות row". crm_order_id alone is enough, but
        // the explicit flag makes the intent obvious to anyone reading
        // the WC order in the WP admin.
        { key: 'crm_payment_only', value: 'true' },
        // Audit marker — anyone inspecting the WC order can see exactly
        // which CRM-computed total we shipped. Useful when reconciling.
        { key: 'crm_total_charged', value: amountStr },
      ],
    };

    if (paymentProductId > 0) {
      wcBody.line_items = [
        {
          product_id: paymentProductId,
          quantity:   1,
          subtotal:     amountStr,
          total:        amountStr,
          subtotal_tax: '0.00',
          total_tax:    '0.00',
          tax_status:  'none',
          tax_class:   '',
        },
      ];
    } else {
      wcBody.fee_lines = [
        {
          name:        `תשלום עבור הזמנה ${order.מספר_הזמנה || orderId}`,
          total:        amountStr,
          total_tax:   '0.00',
          tax_status:  'none',
          tax_class:   '',
        },
      ];
    }

    const wcEndpoint = `${WC_URL}/wp-json/wc/v3/orders`;
    const basicAuth  = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');

    console.log('[WC payment-link] → URL:', wcEndpoint);
    console.log('[WC payment-link] → body:', wcBody);

    const wcRes = await fetch(wcEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(wcBody),
    });

    const wcRawText = await wcRes.text();
    console.log('[WC payment-link] response status', wcRes.status);
    console.log('[WC payment-link] response body', wcRawText);

    let wcJson: Record<string, unknown>;
    try {
      wcJson = JSON.parse(wcRawText);
    } catch {
      console.error('[WC payment-link] non-JSON response');
      return NextResponse.json(
        { error: `WooCommerce החזיר תגובה לא תקינה (HTTP ${wcRes.status}). בדקי שכתובת האתר נכונה ושה-REST API פעיל.` },
        { status: 502 },
      );
    }

    if (!wcRes.ok) {
      const wcCode    = wcJson.code    as string | undefined;
      const wcMessage = (wcJson.message as string | undefined)
                     || wcCode
                     || `HTTP ${wcRes.status}`;
      // Map a known WC error code to a more actionable Hebrew message.
      const friendly = wcCode === 'woocommerce_rest_required_product_reference'
        ? 'WooCommerce דורש product_id/sku עבור line_items. יש להגדיר WOOCOMMERCE_PAYMENT_PRODUCT_ID או להשאיר את fee_lines פעיל.'
        : `WooCommerce דחה את הבקשה (HTTP ${wcRes.status}): ${wcMessage}`;
      console.error('[WC payment-link] rejected — status', wcRes.status, '| code:', wcCode, '| msg:', wcMessage);
      return NextResponse.json(
        {
          error: friendly,
          debug: {
            wc_http_status: wcRes.status,
            wc_code:        wcCode ?? null,
            wc_body:        wcRawText.slice(0, 1500),
          },
        },
        { status: 502 },
      );
    }

    // Success path. WC returns `payment_url` directly on the order object —
    // it's the full /checkout/order-pay/ID/?pay_for_order=true&key=... URL
    // that the customer would normally hit from their account.
    const payment_url = wcJson.payment_url as string | undefined;
    const wcOrderId   = wcJson.id          as number | string | undefined;
    const wcOrderKey  = wcJson.order_key   as string | undefined;
    const wcTotal     = wcJson.total       as string | number | undefined;

    // CRM-vs-WC total cross-check. If WC returned a total that doesn't match
    // what we sent, some store-level setting (taxes, fees, plugins) is
    // mutating the amount silently — the customer would be charged the
    // wrong number. We log loudly so it shows up in Vercel function logs;
    // the operator can then audit the WC side. We DO NOT block the flow
    // on a mismatch (would leave the customer with no way to pay), but we
    // do attach a `total_mismatch` field to the response so the UI can
    // surface a warning later if we want.
    const wcTotalNum    = typeof wcTotal === 'number' ? wcTotal : Number(String(wcTotal ?? '').replace(/[^0-9.\-]/g, ''));
    const totalMismatch = Number.isFinite(wcTotalNum) && Math.abs(wcTotalNum - amount) > 0.005;
    if (totalMismatch) {
      console.error(
        '[WC payment-link] ⚠ TOTAL MISMATCH — CRM amount:', amount,
        '| WC returned total:', wcTotal,
        '| order:', orderId,
        '| wc_id:', wcOrderId,
        '— check WooCommerce tax / fee plugins; the customer may be charged the wrong amount.',
      );
    } else {
      console.log('[WC payment-link] success — wc id:', wcOrderId, '| total matches CRM:', amount, '| payment_url:', payment_url);
    }

    if (!payment_url) {
      return NextResponse.json(
        { error: 'WooCommerce לא החזיר payment_url. בדקי שהפלאגין PayPlus מחובר באתר.' },
        { status: 502 },
      );
    }

    // Stamp the CRM side: mark the channel and persist the per-order
    // payment row with the URL. סטטוס_תשלום on the order itself stays as
    // it was — we never auto-flip to 'שולם' here.
    await supabase
      .from('הזמנות')
      .update({ אופן_תשלום: 'WooCommerce', תאריך_עדכון: new Date().toISOString() })
      .eq('id', orderId);

    await supabase.from('תשלומים').insert({
      הזמנה_id:     orderId,
      סכום:         amount,
      אמצעי_תשלום:  'WooCommerce',
      סטטוס_תשלום:  'ממתין',
      תאריך_תשלום:  new Date().toISOString(),
      קישור_תשלום:  payment_url,
      הערות:        wcOrderId ? `wc_order_id:${wcOrderId}${wcOrderKey ? ` · key:${wcOrderKey}` : ''}` : null,
    });

    return NextResponse.json({
      ok: true,
      payment_url,
      wc_order_id: wcOrderId,
      crm_amount:  amount,
      wc_total:    wcTotal ?? null,
      ...(totalMismatch ? { total_mismatch: true } : {}),
    });
  } catch (err) {
    console.error('[WC payment-link] unexpected error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
