// PayPlus REST API client — SERVER-ONLY.
//
// Generates a DIRECT PayPlus hosted payment-page link via
//   POST {PAYPLUS_API_URL}/api/v1.0/PaymentPages/generateLink
//
// Auth uses two HTTP headers — `api-key` / `secret-key` — per the PayPlus
// REST API docs:
//   https://docs.payplus.co.il/reference/post_paymentpages-generatelink
//
// Successful response shape (verified against PayPlus docs):
//   { "results": { "status": "success", "code": 0, "description": "..." },
//     "data":    { "page_request_uid": "...",
//                  "payment_page_link": "https://payments.payplus.co.il/..." } }
//
// SECURITY: PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY are read from server env
// ONLY. They are never logged, never returned to the client, and must never
// be exposed via NEXT_PUBLIC_ vars.

const PAYPLUS_API_URL    = (process.env.PAYPLUS_API_URL || 'https://restapi.payplus.co.il').replace(/\/+$/, '');
const PAYPLUS_API_KEY    = process.env.PAYPLUS_API_KEY;
const PAYPLUS_SECRET_KEY = process.env.PAYPLUS_SECRET_KEY;
const PAYPLUS_PAGE_UID   = process.env.PAYPLUS_PAGE_UID;

// Payment-page validity window, sent as `expiry_datetime` (a STRING number of
// MINUTES) on generateLink. CRITICAL: if we do NOT send this, PayPlus falls
// back to the payment-page (PAGE_UID) setting, whose default is only ~30
// minutes — which is exactly what produced the customer-facing
// "תוקף דף התשלום פג" ("payment page expired") error. Sending an explicit
// window overrides that short page default.
//
// This is the MAX time allowed BEFORE payment — it is not permission to reuse
// the link. Each generated link is a one-time payment request (see route).
// Tune without a code change via PAYPLUS_LINK_EXPIRY_MINUTES; defaults to 24h.
const DEFAULT_LINK_EXPIRY_MINUTES = 24 * 60; // 1440 minutes (24 hours)

function resolveExpiryMinutes(): number {
  const raw = process.env.PAYPLUS_LINK_EXPIRY_MINUTES;
  const n   = Number(raw);
  if (raw && Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  return DEFAULT_LINK_EXPIRY_MINUTES;
}

export type PayPlusConfigStatus = { ok: boolean; missing: string[] };

/** Which PayPlus env vars are present vs missing — never reveals the values. */
export function payplusConfigStatus(): PayPlusConfigStatus {
  const missing = [
    !PAYPLUS_API_KEY    && 'PAYPLUS_API_KEY',
    !PAYPLUS_SECRET_KEY && 'PAYPLUS_SECRET_KEY',
    !PAYPLUS_PAGE_UID   && 'PAYPLUS_PAGE_UID',
  ].filter(Boolean) as string[];
  return { ok: missing.length === 0, missing };
}

export type PayPlusCustomer = {
  name?:  string | null;
  email?: string | null;
  phone?: string | null;
};

export type PayPlusLinkResult =
  | { ok: true;  payment_url: string; page_request_uid: string | null; host: string; expiryMinutes: number }
  | { ok: false; error: string; httpStatus?: number; code?: number | string | null };

/**
 * Create a direct PayPlus hosted payment-page link for a given amount.
 * Returns the customer-facing payment_page_link (payments.payplus.co.il)
 * and the page_request_uid. Does NOT touch WooCommerce.
 */
export async function createPayPlusPaymentLink(args: {
  amount: number;          // payable amount, already VAT/discount-inclusive
  orderNumber: string;     // CRM order number, sent as more_info for reconciliation
  customer?: PayPlusCustomer;
}): Promise<PayPlusLinkResult> {
  const cfg = payplusConfigStatus();
  if (!cfg.ok) {
    return { ok: false, error: `חסרים משתני סביבה של PayPlus: ${cfg.missing.join(', ')}` };
  }

  const endpoint      = `${PAYPLUS_API_URL}/api/v1.0/PaymentPages/generateLink`;
  const expiryMinutes = resolveExpiryMinutes();

  const body: Record<string, unknown> = {
    payment_page_uid: PAYPLUS_PAGE_UID,
    charge_method:    1,        // 1 = Charge (immediate). See PayPlus charge_method enum.
    amount:           args.amount,
    currency_code:    'ILS',
    more_info:        args.orderNumber || '',
    // STRING minutes — overrides the short payment-page default so the link
    // does not expire prematurely. See DEFAULT_LINK_EXPIRY_MINUTES above.
    expiry_datetime:  String(expiryMinutes),
  };

  const cust = args.customer;
  if (cust && (cust.name || cust.email || cust.phone)) {
    body.customer = {
      customer_name: (cust.name  || '').trim(),
      email:         (cust.email || '').trim(),
      phone:         (cust.phone || '').trim(),
    };
  }

  // Safe context only — no secrets.
  console.log('[PayPlus] → generateLink', {
    endpoint,
    order:           args.orderNumber,
    amount:          args.amount,
    expiry_minutes:  expiryMinutes,
    page_uid_set:    Boolean(PAYPLUS_PAGE_UID),
  });

  let res: Response;
  let rawText: string;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'api-key':      PAYPLUS_API_KEY as string,
        'secret-key':   PAYPLUS_SECRET_KEY as string,
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify(body),
    });
    rawText = await res.text();
  } catch (err) {
    console.error('[PayPlus] network error calling generateLink:', err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'שגיאת רשת בפנייה ל-PayPlus' };
  }

  console.log('[PayPlus] ← generateLink HTTP', res.status);

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    console.error('[PayPlus] non-JSON response (HTTP ' + res.status + ')');
    return { ok: false, error: `PayPlus החזיר תגובה לא תקינה (HTTP ${res.status})`, httpStatus: res.status };
  }

  const results = (json.results as { status?: string; code?: number; description?: string } | undefined) || {};
  const data    = (json.data    as { payment_page_link?: string; page_request_uid?: string } | undefined) || {};

  if (!res.ok || results.status !== 'success' || !data.payment_page_link) {
    const code = results.code ?? null;
    // PayPlus reports account/validation errors in a top-level `message` field
    // (e.g. HTTP 422 "THIS COMPANY DONT HAVE THE PERMISSION TO USE THE API" when
    // the company isn't entitled to the REST API). Success bodies instead carry
    // results.description. Surface whichever is present so the real reason shows
    // up in logs and the operator's toast — not a generic "HTTP 422".
    const topMessage = typeof json.message === 'string' ? json.message : '';
    const ppMessage  = topMessage || results.description || `HTTP ${res.status}`;
    console.error('[PayPlus] generateLink failed — HTTP:', res.status, '| code:', code, '| message:', ppMessage);
    return { ok: false, error: `PayPlus דחה את הבקשה: ${ppMessage}`, httpStatus: res.status, code };
  }

  let host = '';
  try { host = new URL(data.payment_page_link).host; } catch { /* leave blank */ }

  // Safety: this CRM flow is PayPlus-direct ONLY. The link MUST be a direct
  // PayPlus host. Reject any WooCommerce/WordPress (adipatifur.co.il) or other
  // host outright — never save/return a non-PayPlus payment URL.
  if (host !== 'payments.payplus.co.il') {
    console.error('[PayPlus] rejected non-PayPlus payment host:', host, '| link:', data.payment_page_link);
    return {
      ok: false,
      error: `קישור התשלום שהוחזר אינו ב-PayPlus (host: ${host || 'לא ידוע'}). הזרימה מאשרת רק payments.payplus.co.il.`,
      httpStatus: res.status,
    };
  }

  console.log('[PayPlus] ✓ payment link created', {
    order:            args.orderNumber,
    host,
    page_request_uid: data.page_request_uid || null,
    expiry_minutes:   expiryMinutes,
  });

  return {
    ok:               true,
    payment_url:      data.payment_page_link,
    page_request_uid: data.page_request_uid || null,
    host,
    expiryMinutes,
  };
}
