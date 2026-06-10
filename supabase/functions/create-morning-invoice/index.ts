import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

// Morning document type codes
const DOC_TYPE: Record<string, number> = {
  tax_invoice:     305, // חשבונית מס — income lines, no payment section
  receipt:         400, // קבלה — income lines + payment section
  invoice_receipt: 320, // חשבונית מס קבלה — income lines + payment section
};

// Document types that require a payment block. Used both to gate the build
// and to enforce that PAYMENT_BUILDERS yields a builder before issuing.
const PAYMENT_DOCS = new Set(['receipt', 'invoice_receipt']);

// Payment builders for Morning's documents API. Each entry returns the full
// payment object (not just a type code).
//
// CRITICAL — type-code mapping per Morning's documented PaymentType enum
// (verified against developers.greeninvoice.co.il / the Apiary spec):
//   -1  Unpaid
//    0  Deduction at source
//    1  Cash
//    2  Check
//    3  Credit card
//    4  Electronic fund transfer (bank transfer)
//    5  PayPal
//   10  Payment app (bit / PayBox / etc.)
//   11  Other
//
// Earlier this file had credit card on `type: 4` and bank transfer on
// `type: 3`. Morning honored those codes literally — every "credit card"
// receipt rendered as "העברה בנקאית" because we were sending the EFT code.
// The fix is the swap below; the old layout is preserved only as comments.
//
// Credit card sub-fields (camelCase, per the official model):
//   cardType     — card brand. Morning's PaymentCardType enum is:
//                    0=Unknown 1=Isracard 2=Visa 3=Mastercard 4=Amex 5=Diners
//   cardNum      — last 4 digits
//   dealType     — deal type: 1=Regular 2=Installments 3=Credit 4=BillingDeclined 5=Other
//   numPayments  — number of installments (1 for a one-shot transaction)
//
// There is NO `subType` / `sub_type` field in the spec — we used to send it
// and it was simply ignored.
//
// ─────────────────────────────────────────────────────────────────────────
//  PAYMENT METHOD MAPPING — CRM button → Morning payment type
// ─────────────────────────────────────────────────────────────────────────
//
//  Restored to the one-click form that worked in commit e2f837f7 (the last
//  proven-good state before the 2422 chase mistakenly attributed the
//  receipts mismatch to the payment block; the actual root cause was the
//  income/totals math, which is fixed separately by the reconciliation
//  block further down). credit card receipts issue with NO manual operator
//  input — cardType:0 ("Unknown") + dealType:1 (Regular) + numPayments:1.
//
//  CRM label       Morning   Morning type     Notes
//                  type      name
//  ─────────────── ───────   ──────────────   ────────────────────────────
//  מזומן            1         Cash             minimal — type/price/date/currency
//  צ'ק / המחאה      2         Check            BLOCKED — needs chequeNum + bank details we don't store
//  כרטיס אשראי     3         Credit card      cardType:0 / dealType:1 / numPayments:1 (one-click)
//  העברה בנקאית     4         Bank transfer    bankName placeholder
//  PayPal           5         PayPal           minimal
//  ביט / bit        10        Payment app      minimal (no subType/appType in IDocumentPayment schema)
//  PayBox           10        Payment app      minimal
//  אחר              11        Other            BLOCKED — Morning empirically does not count type 11 as a receipt
//
//  Reference for the schema:
//    https://raw.githubusercontent.com/yanivps/green-invoice/master/green_invoice/models.py
//
//  If a credit-card 2422 returns despite this, the single-line income
//  fallback retry further down should still close the gap — but in
//  testing on 2026-05-13 this builder issued cleanly with one click.
//
// Reference for the enum values:
//   https://raw.githubusercontent.com/yanivps/green-invoice/master/green_invoice/models.py
type MorningPayment = {
  type: number;
  price: number;
  date: string;
  currency?: string;
  cardType?: number;
  cardNum?: string;
  dealType?: number;
  numPayments?: number;
  bankName?: string;
};

// CRM methods whose required Morning metadata is not stored upstream — we
// refuse to issue rather than guess. The value is the exact Hebrew error
// returned to the caller (and surfaced in the UI toast). Keys cover every
// label the CRM may send including back-compat synonyms (המחאה ↔ צ'ק).
const BLOCKED_METHODS: Record<string, string> = {
  // 'כרטיס אשראי' is NOT blocked — it issues as one-click type 3 via the
  // PAYMENT_BUILDERS entry below (cardType:0 / dealType:1 / numPayments:1).
  "צ'ק":
    'לא ניתן להפיק חשבונית מס קבלה לצ\'ק בלי פרטי הצ\'ק שמורנינג דורש (מספר צ\'ק, בנק, סניף, חשבון). יש להזין פרטי צ\'ק תקפים או לבחור אמצעי תשלום אחר.',
  'המחאה':
    'לא ניתן להפיק חשבונית מס קבלה להמחאה בלי פרטי ההמחאה שמורנינג דורש (מספר המחאה, בנק, סניף, חשבון). יש להזין פרטי המחאה תקפים או לבחור אמצעי תשלום אחר.',
  'אחר':
    'לא ניתן להפיק חשבונית מס קבלה עם אמצעי תשלום "אחר" — מורנינג אינו סופר סוג זה כתקבול תקף ומחזיר שגיאה 2422. יש לבחור אמצעי תשלום ספציפי.',
};

// Human-readable Morning type names — used in the [PAYMENT METHOD MAPPING]
// audit log so the wire-level number always appears alongside its name.
const MORNING_TYPE_NAMES: Record<number, string> = {
  1: 'Cash',
  2: 'Check',
  3: 'Credit card',
  4: 'Bank transfer',
  5: 'PayPal',
  10: 'Payment app',
  11: 'Other',
};

const PAYMENT_BUILDERS: Record<string, (price: number, date: string) => MorningPayment> = {
  'מזומן':         (price, date) => ({ type: 1, price, date, currency: 'ILS' }),
  // type 3 = Credit card. One-click — we don't capture brand or last-4
  // upstream, so cardType:0 (Unknown) is the safest valid enum value
  // (1-5 would mis-claim a brand). dealType:1 (Regular) and numPayments:1
  // are the defaults Morning expects for a single-payment swipe. Matches
  // the proven-good builder from commit e2f837f7 (2026-05-13).
  'כרטיס אשראי':   (price, date) => ({ type: 3, price, date, currency: 'ILS', cardType: 0, dealType: 1, numPayments: 1 }),
  // type 4 = Electronic fund transfer (bank transfer). bankName is a
  // human-readable placeholder for documents where we don't know the bank.
  'העברה בנקאית':  (price, date) => ({ type: 4, price, date, currency: 'ILS', bankName: 'לא צוין' }),
  // type 5 = PayPal (its own dedicated enum value).
  'PayPal':        (price, date) => ({ type: 5, price, date, currency: 'ILS' }),
  // type 10 = Payment app — bit / PayBox / similar Israeli wallets. The
  // official IDocumentPayment schema has NO subType/appType field for type
  // 10, so the minimal {type,price,date,currency} signature is correct.
  // Two keys for "bit" — Hebrew 'ביט' (current CRM button label) and
  // English 'bit' (back-compat for older order rows).
  'ביט':           (price, date) => ({ type: 10, price, date, currency: 'ILS' }),
  'bit':           (price, date) => ({ type: 10, price, date, currency: 'ILS' }),
  'PayBox':        (price, date) => ({ type: 10, price, date, currency: 'ILS' }),
};

// Business customer types store prices EXCLUSIVE of VAT (pre-VAT amounts in CRM).
// All other types (private/retail) store prices INCLUSIVE of VAT in the CRM.
const BUSINESS_TYPES = new Set(['עסקי', 'עסקי - קבוע', 'עסקי - כמות']);

async function getMorningToken(apiId: string, apiSecret: string): Promise<string> {
  const res = await fetch(`${MORNING_API_BASE}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: apiId, secret: apiSecret }),
  });
  const rawBody = await res.text();
  console.log('[morning] Auth status:', res.status);
  if (!res.ok) throw new Error(`Morning auth failed ${res.status}: ${rawBody}`);
  const data = JSON.parse(rawBody);
  if (!data.token) throw new Error('No token in Morning auth response');
  return data.token;
}

serve(async (req: Request) => {
  try {
    // ── Entry marker — FIRST line of every invocation ─────────────────────
    // Bracket-free tag so the Supabase dashboard search treats it as plain
    // text (`[` is a metacharacter in Logflare's search bar and can match
    // nothing). If you see no INVDBG_V2 lines for a 2422 invocation, the
    // deployed code is not this version OR Logflare dropped the lines.
    console.log('INVDBG_V2 entry | version: flatten-qty1-2422-fix-v2 | ts:', new Date().toISOString());
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    const incomingSecret = req.headers.get('x-webhook-secret') ?? '';
    if (!webhookSecret || incomingSecret !== webhookSecret) {
      console.error('[morning] Unauthorized — x-webhook-secret mismatch');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const payload = await req.json();
    // document_type: 'tax_invoice' | 'receipt' | 'invoice_receipt'.
    // Manual issuance (the new POST /api/orders/[id]/create-document route)
    // also passes `payment_method` to override `order.אופן_תשלום`, and
    // `force=true` to bypass the (הזמנה_id, סוג_מסמך) idempotency guard
    // when the user explicitly opts in to a duplicate.
    let documentType: string = payload.document_type ?? 'tax_invoice';

    // ── debugMorningMode — server-only diagnostic switch ──────────────────
    // Set by an explicit API caller (NOT exposed in any UI). Lets us A/B the
    // exact part of the payload Morning rejects with errorCode 2422 without
    // changing default production behavior. Each mode is documented inline
    // where its branch fires. Default (anything else) is 'normal'.
    //   normal                     — current production behavior
    //   no_delivery_merge          — keep separate "דמי משלוח" income line
    //   single_gross_income_line   — collapse income to ONE line at CRM gross
    //   single_net_income_line     — collapse income to ONE line at CRM net (gross/1.18)
    //   tax_invoice_only           — force type 305 (no payment block)
    type DebugMorningMode =
      | 'normal'
      | 'no_delivery_merge'
      | 'single_gross_income_line'
      | 'single_net_income_line'
      | 'tax_invoice_only';
    const debugMorningMode: DebugMorningMode = (() => {
      const v = payload.debugMorningMode;
      if (
        v === 'no_delivery_merge' ||
        v === 'single_gross_income_line' ||
        v === 'single_net_income_line' ||
        v === 'tax_invoice_only'
      ) {
        return v;
      }
      return 'normal';
    })();
    if (debugMorningMode !== 'normal') {
      console.warn('[DEBUG MORNING MODE] ACTIVE:', debugMorningMode, '— NOT a production path');
    }
    if (debugMorningMode === 'tax_invoice_only') {
      documentType = 'tax_invoice';
    }
    console.log('[morning] received document_type:', documentType);

    const morningDocType = DOC_TYPE[documentType];
    if (!morningDocType) {
      // Friendly Hebrew error so the toast in the UI reads cleanly. Lists
      // the supported types so the operator can self-diagnose.
      const supported = Object.keys(DOC_TYPE).join(', ');
      console.error('[morning] resolved morning type: NONE — unsupported document_type:', documentType);
      return new Response(
        JSON.stringify({
          error: `סוג המסמך לא נתמך במערכת: ${documentType}. סוגים נתמכים: ${supported}.`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.log('[morning] resolved morning type:', morningDocType);

    const paymentMethodOverride: string | null =
      typeof payload.payment_method === 'string' && payload.payment_method.trim()
        ? payload.payment_method.trim()
        : null;
    const paymentMethodSource: string | null =
      typeof payload.payment_method_source === 'string' && payload.payment_method_source.trim()
        ? payload.payment_method_source.trim()
        : null;
    const force: boolean = payload.force === true;

    console.log('[PAYMENT EF] document_type:', documentType);
    console.log('[PAYMENT EF] payload.type:', payload.type);
    console.log('[PAYMENT EF] received payment_method:', JSON.stringify(paymentMethodOverride));
    console.log('[PAYMENT EF] received payment_method_source:', JSON.stringify(paymentMethodSource));
    console.log('[PAYMENT EF] force:', force);

    if (payload.type !== 'UPDATE') {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'not UPDATE' }), { status: 200 });
    }

    const orderId: string = payload.record?.הזמנה_id;
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing הזמנה_id' }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Idempotency: per order + document type. Bypassed when the caller
    // sets force=true (only the manual issuance modal sends that, after the
    // user has explicitly confirmed they want a duplicate).
    if (!force) {
      const { data: existingDoc } = await supabase
        .from('חשבוניות')
        .select('id, מספר_חשבונית')
        .eq('הזמנה_id', orderId)
        .eq('סוג_מסמך', documentType)
        .maybeSingle();

      if (existingDoc) {
        console.log('[morning]', documentType, 'already exists for order', orderId, '— skipping');
        return new Response(JSON.stringify({ success: true, skipped: true, invoice_id: existingDoc.id }), { status: 200 });
      }
    } else {
      console.log('[morning] force=true — bypassing idempotency check');
    }

    // Fetch order + customer type for VAT decision
    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .select(`
        id, מספר_הזמנה, לקוח_id, סך_הכל_לתשלום, סכום_לפני_הנחה, סכום_הנחה,
        סוג_הנחה, ערך_הנחה, אופן_תשלום, דמי_משלוח, זיכוי_בשימוש,
        לקוחות (שם_פרטי, שם_משפחה, אימייל, טלפון, סוג_לקוח)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    const { data: items, error: itemsErr } = await supabase
      .from('מוצרים_בהזמנה')
      .select(`
        id, סוג_שורה, גודל_מארז, כמות, מחיר_ליחידה, סהכ, הערות_לשורה,
        שם_פריט_מותאם, סדר_תצוגה,
        מוצרים_למכירה (שם_מוצר),
        בחירת_פטיפורים_בהזמנה (כמות, סוגי_פטיפורים (שם_פטיפור))
      `)
      .eq('הזמנה_id', orderId)
      .order('סדר_תצוגה', { ascending: true });

    if (itemsErr) throw new Error(`Failed to fetch items: ${itemsErr.message}`);

    const morningApiId = Deno.env.get('MORNING_API_ID') ?? '';
    const morningApiSecret = Deno.env.get('MORNING_API_SECRET') ?? '';
    console.log('[morning] API_ID exists:', !!morningApiId, '| API_SECRET exists:', !!morningApiSecret);
    if (!morningApiId || !morningApiSecret) throw new Error('MORNING_API_ID or MORNING_API_SECRET not set');

    const token = await getMorningToken(morningApiId, morningApiSecret);

    type CustomerRow = { שם_פרטי: string; שם_משפחה: string; אימייל: string | null; טלפון: string | null; סוג_לקוח: string | null };
    const customer = order.לקוחות as CustomerRow;
    const isBusiness = BUSINESS_TYPES.has(customer.סוג_לקוח ?? '');

    // ── Final payable — the single source of truth ───────────────────────
    // `order.סך_הכל_לתשלום` is stored WITHOUT VAT-grossing: it is
    // `subtotal − discount + shipping − credit` (see orders create-full /
    // the new-order page). Its meaning depends on customer type:
    //
    //   • Retail / private (vatType:0): it IS the final GROSS payable.
    //       line.price = raw CRM price (VAT-INCLUSIVE), taken AS-IS.
    //       Morning's gross total = sum(line.price × qty) = crmDisplayedTotal.
    //   • Business (vatType:1): it is the NET (pre-VAT) amount. The CRM adds
    //       18% on top for the customer-facing "final payable" (the new-order
    //       page's totalWithVat). So:
    //       line.price = raw CRM price (PRE-VAT), taken AS-IS (NO /1.18).
    //       Morning ADDS 18% → gross = sum(line.price × qty) × 1.18
    //                                = round(crmDisplayedTotal × 1.18).
    //
    // So customer type DOES change the final invoice total: business pays
    // net×1.18, private pays the stored total. In BOTH cases the income
    // line-sum we target is `crmDisplayedCents` (the raw CRM amounts, no
    // toNet conversion); only the final gross differs. Any sub-agora drift
    // between Morning's per-line rounding and that target is closed by a
    // single "עיגול" reconciliation line below, then asserted by a hard
    // pre-flight guard against the gross final payable.
    const VAT_RATE = 0.18;
    const VAT_MULT = 1 + VAT_RATE;

    const crmStoredTotal = Number(order.סך_הכל_לתשלום ?? 0);
    const crmDisplayedTotal = crmStoredTotal;
    const crmDisplayedCents = Math.round(crmDisplayedTotal * 100);

    // ── Build income lines — each order item appears exactly ONCE ─────────
    // No qty-flattening (that was the source of "duplicated products" on the
    // customer's invoice). Each row in מוצרים_בהזמנה → one line on the
    // invoice with its original quantity. Manual / custom items keep their
    // operator-given name. Morning rounding drift is reconciled below.
    type IncomeLine = { description: string; quantity: number; price: number; vatType: 1 };
    const incomeLines: IncomeLine[] = [];

    const rawItems = (items ?? []) as Array<Record<string, unknown>>;
    for (const item of rawItems) {
      let description = '';
      const lineType = item.סוג_שורה as string | undefined;
      if (lineType === 'מארז' && item.גודל_מארז) {
        description = `מארז פטיפורים ${item.גודל_מארז} יחידות`;
        const selections = (item.בחירת_פטיפורים_בהזמנה as Array<{ כמות: number; סוגי_פטיפורים: { שם_פטיפור: string } }>) ?? [];
        if (selections.length > 0) {
          description += ` (${selections.map((s) => `${s.סוגי_פטיפורים?.שם_פטיפור} ×${s.כמות}`).join(', ')})`;
        }
      } else if (lineType === 'מוצר_ידני' || lineType === 'תוספת_תשלום') {
        // Manual / custom rows — use the operator-typed name; fall back to
        // a generic label only if שם_פריט_מותאם is empty.
        description = ((item.שם_פריט_מותאם as string | null) ?? '').trim()
          || ((item.מחיר_ליחידה as number) < 0 ? 'הנחה' : 'פריט');
      } else {
        description = (item.מוצרים_למכירה as { שם_מוצר: string } | null)?.שם_מוצר ?? 'פריט';
      }
      if (item.הערות_לשורה) description += ` — ${item.הערות_לשורה}`;
      const qty = Number(item.כמות ?? 1) || 1;
      const unit = Number(item.מחיר_ליחידה ?? 0) || 0;
      // Raw CRM price — no toNet. Document-level vatType decides Morning's
      // interpretation (see header rationale).
      incomeLines.push({ description, quantity: qty, price: unit, vatType: 1 });
    }

    // ── Delivery fee — separate income line ──────────────────────────────
    // Customer-facing requirement: the printed invoice must show delivery
    // on its own line ("דמי משלוח"), not merged into a product. This is
    // the same shape the 11 production invoices (60057..60073) used before
    // the merge was introduced as a 2422 workaround. The 2422 turned out
    // to be a VAT-semantics bug (fixed in 89cb602e), not a delivery-line
    // bug — a separate delivery line works correctly under the restored
    // semantics. The reconciliation `עיגול` line below still handles any
    // sub-agora drift between item math and the CRM total.
    const deliveryAmount = Number(order.דמי_משלוח ?? 0);
    let deliveryHandling: string;
    if (deliveryAmount > 0) {
      // Raw CRM amount — same units as item prices.
      incomeLines.push({
        description: 'דמי משלוח',
        quantity: 1,
        price: deliveryAmount,
        vatType: 1,
      });
      deliveryHandling = `separate "דמי משלוח" line @ ${deliveryAmount}`;
    } else {
      deliveryHandling = 'no delivery fee on order';
    }

    // ── Single-line income collapse — diagnostic modes ────────────────────
    // These two modes replace ALL income lines (products + delivery + any
    // earlier discount/credit) with one synthetic line so we can isolate
    // whether Morning is rejecting per-line breakdowns vs. a single line.
    // They run BEFORE discount/credit construction (those still append) —
    // but since the synthetic line already encodes the CRM total, we also
    // skip subsequent discount/credit pushes when in these modes.
    if (debugMorningMode === 'single_gross_income_line') {
      // ONE line whose price equals the CRM gross total. We keep vatType:1
      // at the line level because the document-level vatType:1 is the only
      // VAT semantic this codebase trusts — if Morning still treats this
      // single line as net and adds 18%, the resulting gross will be
      // crmDisplayedTotal × 1.18 (a noticeable, easily-spotted divergence
      // in the [MORNING TOTAL DIAGNOSTICS] log).
      incomeLines.length = 0;
      incomeLines.push({
        description: 'סך הכל לחיוב',
        quantity: 1,
        price: crmDisplayedTotal,
        vatType: 1,
      });
    } else if (debugMorningMode === 'single_net_income_line') {
      // ONE line at CRM_net = CRM_gross / 1.18 (rounded to 2 decimals).
      // Under Morning's single-round-on-net-sum totaling, this should yield
      // exactly crmDisplayedCents as the income gross.
      const netCents = Math.round(crmDisplayedCents / VAT_MULT);
      incomeLines.length = 0;
      incomeLines.push({
        description: 'סך הכל לחיוב (לפני מע"מ)',
        quantity: 1,
        price: netCents / 100,
        vatType: 1,
      });
    }

    // Discount + credit: skipped entirely in single_* debug modes because
    // the synthetic single line already encodes the CRM total (which has
    // discount/credit baked in via order.סך_הכל_לתשלום).
    const inSingleLineMode =
      debugMorningMode === 'single_gross_income_line' ||
      debugMorningMode === 'single_net_income_line';

    // Discount — exactly one line (percent OR fixed; never both).
    const discValue = Number(order.ערך_הנחה ?? 0);
    if (!inSingleLineMode && order.סוג_הנחה === 'אחוז' && discValue > 0) {
      const netBeforeDiscount = incomeLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
      const discNet = Math.round(netBeforeDiscount * discValue / 100 * 100) / 100;
      incomeLines.push({ description: `הנחה ${discValue}%`, quantity: 1, price: -discNet, vatType: 1 });
    } else if (!inSingleLineMode && order.סוג_הנחה === 'סכום' && discValue > 0) {
      // Raw CRM discount amount — same units as item prices (no toNet).
      incomeLines.push({ description: 'הנחה', quantity: 1, price: -discValue, vatType: 1 });
    }

    // Customer credit usage — already baked into סך_הכל_לתשלום at order time.
    // Surface it as an explicit deduction line so the customer-facing invoice
    // matches the CRM total without needing a generic rounding fudge.
    const creditUsed = Number((order as Record<string, unknown>).זיכוי_בשימוש ?? 0);
    if (!inSingleLineMode && creditUsed > 0) {
      // Raw CRM credit amount — same units as item prices (no toNet).
      incomeLines.push({ description: 'זיכוי לקוחה', quantity: 1, price: -creditUsed, vatType: 1 });
    }

    // ── Reconcile line sum to crmDisplayedCents ───────────────────────────
    // Morning's view of the invoice gross depends on documentBody.vatType:
    //   • Business (vatType:1): gross = round(sum(line.price×qty) × 1.18, 2)
    //   • Retail  (vatType:0): gross =        sum(line.price×qty)
    // We compute the target LINE-SUM that makes Morning's gross equal
    // crmDisplayedCents exactly, then add a single "עיגול" line for any
    // residual drift between item math and the CRM total.
    //
    // Helper — what Morning's gross-in-cents is for a given line set.
    const morningGrossCents = (lines: IncomeLine[]): number => {
      const lineSumCents = lines.reduce(
        (sum, l) => sum + Math.round(l.price * l.quantity * 100),
        0,
      );
      return isBusiness ? Math.round(lineSumCents * VAT_MULT) : lineSumCents;
    };

    const actualLineSumCents = incomeLines.reduce(
      (sum, l) => sum + Math.round(l.price * l.quantity * 100),
      0,
    );
    // Income line-sum target is the raw CRM amount for BOTH customer types
    // (prices are sent AS-IS — no /1.18 for business). The final GROSS
    // payable then differs by VAT mode:
    //   • Business (vatType:1): Morning adds 18% → gross = round(net × 1.18).
    //   • Private  (vatType:0): prices are already gross → gross = net.
    const finalPayableCents = isBusiness
      ? Math.round(crmDisplayedCents * VAT_MULT)
      : crmDisplayedCents;
    const targetLineSumCents = crmDisplayedCents;
    const correctionCents = targetLineSumCents - actualLineSumCents;
    const correctionLineCount = correctionCents !== 0 ? 1 : 0;
    if (correctionCents !== 0) {
      incomeLines.push({
        description: 'עיגול',
        quantity: 1,
        price: correctionCents / 100,
        vatType: 1,
      });
    }

    // Final money snapshot — used by the guard, the [INVOICE PAYLOAD DEBUG]
    // log, and the payment block. paymentAmount is the CRM displayed total
    // by construction (this is the contract — customer type doesn't change
    // the invoice total).
    const finalLineSumCents = incomeLines.reduce(
      (sum, l) => sum + Math.round(l.price * l.quantity * 100),
      0,
    );
    const finalGrossCents = isBusiness
      ? Math.round(finalLineSumCents * VAT_MULT)
      : finalLineSumCents;
    const incomeLinesTotal = finalGrossCents / 100;
    // paymentAmount is the customer-facing GROSS final payable:
    //   • Private:  crmDisplayedTotal (already gross).
    //   • Business: round(crmDisplayedTotal × 1.18) (CRM stores the net).
    const paymentAmount = finalPayableCents / 100;
    const mismatchCents = finalGrossCents - finalPayableCents;
    const totalCorrectionGrossCents = correctionCents !== 0
      ? morningGrossCents([{ description: 'עיגול', quantity: 1, price: correctionCents / 100, vatType: 1 }])
      : 0;

    // Per-line snapshot for the debug log (informational only).
    const incomeLinesDebug = incomeLines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      price: line.price,
      vatType: line.vatType,
      lineNet: Math.round(line.price * line.quantity * 100) / 100,
      isDiscount: line.price < 0 && line.description !== 'עיגול',
      isDelivery: line.description === 'דמי משלוח',
      isCorrection: line.description === 'עיגול',
    }));

    // Net / VAT breakdown for the [VAT] audit log only.
    //   Business: line sum IS the net total; Morning adds VAT on top.
    //   Retail:   line sum IS the gross total; back-calculate net from gross.
    const netCentsForLog = isBusiness
      ? finalLineSumCents
      : Math.round(finalGrossCents / VAT_MULT);
    const roundedNet = netCentsForLog / 100;
    const roundedVat = (finalGrossCents - netCentsForLog) / 100;

    const paymentLinesDebug = PAYMENT_DOCS.has(documentType)
      ? [{ method: paymentMethodOverride, amount: paymentAmount }]
      : [];

    // ── [INVOICE GUARD] required summary log on every issuance ────────────
    console.log('[INVOICE GUARD]',
      '| order_id:', orderId,
      '| order_number:', order.מספר_הזמנה,
      '| invoice_type:', documentType, `(${morningDocType})`,
      '| customer_type:', customer.סוג_לקוח ?? 'פרטי',
      '| isBusiness:', isBusiness,
      '| CRM_stored_total:', crmStoredTotal,
      '| CRM_displayed_total_used:', crmDisplayedTotal,
      '| raw_item_count:', rawItems.length,
      '| final_invoice_line_count:', incomeLines.length,
      '| final_gross_before_send:', incomeLinesTotal,
      '| mismatch_with_CRM:', mismatchCents / 100,
      '| correction_lines_added:', correctionLineCount,
      '| correction_gross_total_cents:', totalCorrectionGrossCents,
    );

    // ── [INVOICE PAYLOAD TOTALS] — required user-spec totals log ──────────
    // Single-line, pre-POST. Mirrors the exact totals that will leave this
    // process for Morning. Covers every invoice type and payment method.
    console.log('[INVOICE PAYLOAD TOTALS]',
      '| order_id:', orderId,
      '| order_number:', order.מספר_הזמנה,
      '| CRM_preview_total:', crmDisplayedTotal,
      '| income_gross_total:', incomeLinesTotal,
      '| payment_amount:', paymentAmount,
      '| diff_income_vs_payment:', Math.round((incomeLinesTotal - paymentAmount) * 100) / 100,
      '| document_type:', documentType,
      '| payment_method:', paymentMethodOverride ?? 'NONE',
      '| income_line_count:', incomeLines.length,
    );

    // ── [DELIVERY FEE INVOICE HANDLING] — required delivery-handling log ──
    // Single-line, pre-POST. Records how delivery was represented in the
    // Morning income array for this invoice.
    console.log('[DELIVERY FEE INVOICE HANDLING]',
      '| order_number:', order.מספר_הזמנה,
      '| delivery_fee_original_amount:', deliveryAmount,
      '| handling:', deliveryHandling,
      '| final_income_total:', incomeLinesTotal,
      '| final_payment_total:', paymentAmount,
    );

    // ── Hard pre-flight guard — refuse to call Morning on mismatch ────────
    // After the reconciliation line above, mismatchCents must be exactly 0.
    // If it isn't, the input data is corrupt enough that we should stop
    // rather than ship a wrong-amount invoice to the tax authority.
    if (mismatchCents !== 0) {
      console.error('[INVOICE GUARD] MISMATCH — refusing to send',
        '| order:', order.מספר_הזמנה,
        '| computed_gross:', incomeLinesTotal,
        '| expected_final_payable:', finalPayableCents / 100,
        '| crm_stored_total:', crmDisplayedTotal,
        '| isBusiness:', isBusiness,
        '| diff_cents:', mismatchCents,
        '| lines:', JSON.stringify(incomeLinesDebug));
      throw new Error(
        `אי-התאמת סכום בחשבונית: סך הכל בחשבונית ${incomeLinesTotal.toFixed(2)} ₪ ` +
        `שונה מהסכום לתשלום ${(finalPayableCents / 100).toFixed(2)} ₪. ` +
        `הפרש: ${(mismatchCents / 100).toFixed(2)} ₪. החשבונית לא הופקה.`,
      );
    }

    // ── [invoice-debug] — sanitized payload calculation dump ──────────────
    // CRITICAL: every log here is a SINGLE-LINE string. Multi-line JSON
    // (JSON.stringify with indent) was getting split by Supabase's Logflare
    // pipeline so the dashboard search "[invoice-debug]" missed everything
    // after the first line. No null/2 pretty-print below.
    console.log('[invoice-debug] VERSION: business-vat-net-gross-v19');
    console.log('[invoice-debug] order:', order.מספר_הזמנה, '| document type:', documentType, '| morningType:', morningDocType);
    console.log('[invoice-debug] client:', JSON.stringify({
      id: order.לקוח_id,
      name: `${customer.שם_פרטי} ${customer.שם_משפחה}`,
      type: customer.סוג_לקוח ?? 'פרטי',
      isBusiness,
    }));
    console.log('[invoice-debug] income lines:', JSON.stringify(incomeLinesDebug));
    console.log('[invoice-debug] payment lines:', JSON.stringify(paymentLinesDebug));
    console.log('[invoice-debug] total income gross:', incomeLinesTotal);
    console.log('[invoice-debug] total payment amount:', paymentAmount);
    console.log('[invoice-debug] CRM displayed total (anchor):', crmDisplayedTotal);
    const summary = incomeLinesDebug
      .map((l, i) => `#${i}:net=${l.price}x${l.quantity}${l.isDiscount ? '(disc)' : ''}${l.isDelivery ? '(deliv)' : ''}${l.isCorrection ? '(corr)' : ''}`)
      .join(' | ');
    console.log('[invoice-debug] SUMMARY |', 'order:', order.מספר_הזמנה,
      '| count:', incomeLinesDebug.length,
      '| incomeTotal:', incomeLinesTotal,
      '| paymentAmount:', paymentAmount,
      '| CRM:', crmDisplayedTotal,
      '| lines:', summary);

    // ── VAT audit log ──────────────────────────────────────────────────────
    // VAT split mirrors the preview's "exclVat / vatAmt / total" rows. The
    // customer type is logged for traceability only; it does NOT alter math.
    console.log('[VAT]', JSON.stringify({
      customerType: customer.סוג_לקוח ?? 'פרטי',
      isBusiness,
      vatHandling: 'inclusive: CRM amounts (סך_הכל_לתשלום, line prices, fees, discounts) are treated as VAT-inclusive — same as the invoice preview',
      orderTotalFromCRM: crmStoredTotal,
      crmDisplayedTotal,
      netAmount: roundedNet,
      vatAmount: roundedVat,
      invoiceTotal: paymentAmount,
    }));
    console.log('[morning] document_type:', documentType, '| morningType:', morningDocType, '| isBusiness:', isBusiness, '| paymentAmount:', paymentAmount);

    const documentBody: Record<string, unknown> = {
      description: `הזמנה ${order.מספר_הזמנה}`,
      type: morningDocType,
      date: new Date().toISOString().slice(0, 10),
      lang: 'he',
      currency: 'ILS',
      // documentBody.vatType = isBusiness ? 1 : 0 (restored from pre-48a811a1
      // — the form that issued invoices 60057..60073 successfully).
      //   • Business (vatType:1): line.price is pre-VAT; Morning ADDS 18%.
      //   • Retail   (vatType:0): line.price is VAT-INCLUSIVE; taken as-is.
      // Customer type does NOT change the final invoice total (paymentAmount
      // is always crmDisplayedTotal); it only changes how Morning interprets
      // line prices.
      vatType: isBusiness ? 1 : 0,
      client: {
        name: `${customer.שם_פרטי} ${customer.שם_משפחה}`,
        ...(customer.אימייל ? { emails: [customer.אימייל] } : {}),
        ...(customer.טלפון ? { phone: customer.טלפון } : {}),
      },
      // Each order item appears exactly ONCE with its original quantity. No
      // qty-flattening — that caused visually-duplicated lines on the
      // customer's invoice. A small "עיגול" net line was added above (if
      // needed) to reconcile Morning's per-line rounding with the CRM total.
      income: incomeLines,
    };

    // Receipt + invoice_receipt include a payment section; tax_invoice does
    // not. The caller MUST send `payment_method` explicitly for PAYMENT_DOCS
    // — there is no fallback to `order.אופן_תשלום` and no silent default.
    //
    // Why: orders coming from WooCommerce store `אופן_תשלום='העברה בנקאית'`
    // for bacs. A previous version of this branch fell back to that value,
    // which silently labelled documents as bank transfer even when the user
    // explicitly picked credit card in the modal. Any caller that fails to
    // pass `payment_method` for a PAYMENT_DOC now gets a hard 400 instead of
    // a silently mislabelled receipt.
    if (PAYMENT_DOCS.has(documentType)) {
      // ── PROVENANCE GATE ───────────────────────────────────────────────
      // The only legal source for a PAYMENT_DOC's payment method is the
      // manual issuance modal. Any other path (an old browser, a re-played
      // webhook, a misconfigured caller) is rejected before we touch
      // Morning. This is the single most important guard in the whole
      // chain — owner-mandated "fail loud rather than silently mis-label".
      if (paymentMethodSource !== 'manual_modal') {
        console.error('[PAYMENT EF] REFUSE — PAYMENT_DOC issuance without payment_method_source=manual_modal',
          '| documentType:', documentType,
          '| received source:', JSON.stringify(paymentMethodSource),
          '| received payment_method (NOT used):', JSON.stringify(paymentMethodOverride),
          '| order.אופן_תשלום (NOT used):', order.אופן_תשלום);
        return new Response(
          JSON.stringify({
            error: 'הפקת המסמך נחסמה: לא הוכח שאמצעי התשלום נבחר במודאל ההפקה. רעני את הדף ונסי שוב.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (!paymentMethodOverride) {
        console.error('[PAYMENT EF] REFUSE — PAYMENT_DOC issuance with no payment_method override',
          '| documentType:', documentType,
          '| order.אופן_תשלום (NOT used):', order.אופן_תשלום);
        return new Response(
          JSON.stringify({
            error: `המסמך מסוג ${documentType} דורש אמצעי תשלום מפורש מהקליינט. אסור להפיק עם ברירת מחדל.`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const paymentMethod = paymentMethodOverride;

      // ── Block list — fail loud with a clear Hebrew error if Morning
      // requires metadata the CRM does not (yet) capture for this method.
      // Runs BEFORE the PAYMENT_BUILDERS lookup so a blocked method never
      // gets silently re-routed through a different builder.
      const blockReason = BLOCKED_METHODS[paymentMethod];
      if (blockReason) {
        console.error('[PAYMENT EF] REFUSE — payment method blocked (missing Morning metadata):',
          '| CRM_method:', JSON.stringify(paymentMethod),
          '| documentType:', documentType,
          '| reason:', blockReason);
        // Also emit the audit log so [PAYMENT METHOD MAPPING] is present on
        // every issuance attempt, even refused ones.
        console.log('[PAYMENT METHOD MAPPING]',
          '| CRM_label:', paymentMethod,
          '| Morning_type:', 'BLOCKED',
          '| Morning_type_name:', 'BLOCKED',
          '| Required_extra_fields_present:', false,
          '| Payment_block:', 'null (refused)',
        );
        return new Response(
          JSON.stringify({ error: blockReason }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Plain PAYMENT_BUILDERS lookup — credit card now has its own entry
      // (no runtime metadata input needed). Methods in BLOCKED_METHODS are
      // refused above; methods that are neither in the builders table nor
      // the block list (truly unrecognized) fall through to the 400 below.
      const builder = PAYMENT_BUILDERS[paymentMethod];
      if (!builder) {
        console.error('[PAYMENT EF] REFUSE — payment method not in PAYMENT_BUILDERS:',
          JSON.stringify(paymentMethod),
          '| documentType:', documentType,
          '| supported:', Object.keys(PAYMENT_BUILDERS).join(', '),
          '| blocked:', Object.keys(BLOCKED_METHODS).join(', '));
        return new Response(
          JSON.stringify({
            error: `אמצעי התשלום "${paymentMethod}" לא ממופה למורנינג. יש לבחור אמצעי תשלום אחר או לעדכן את המיפוי.`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const paymentObj = builder(paymentAmount, new Date().toISOString().slice(0, 10));
      documentBody.payment = [paymentObj];
      console.log('[PAYMENT EF] selected builder for method:', paymentMethod);
      console.log('[PAYMENT EF] morning payment type sent to API:', paymentObj.type);
      console.log('[PAYMENT EF] full payment object:', JSON.stringify(paymentObj));
      // Single-line audit log — full mapping table fields exposed per spec
      // so each invocation logs CRM label, Morning type number + name,
      // whether all method-specific required extras are present in the
      // payment block, and the exact JSON block sent. Independent of the
      // [PAYMENT EF] lines above so it survives Logflare grouping.
      const morningTypeName = MORNING_TYPE_NAMES[paymentObj.type] ?? 'UNKNOWN';
      // Required-extras presence check — per the mapping table at the top
      // of this file. Only the types we actively send appear here.
      const requiredExtrasPresent = (() => {
        switch (paymentObj.type) {
          case 1: return true;                              // Cash — none required
          case 3:                                           // Credit card — cardType (0..5) + dealType + numPayments
            return Number.isInteger(paymentObj.cardType) && paymentObj.cardType! >= 0 && paymentObj.cardType! <= 5
              && Number.isInteger(paymentObj.dealType) && paymentObj.dealType! >= 1
              && Number.isInteger(paymentObj.numPayments) && paymentObj.numPayments! >= 1;
          case 4: return Boolean(paymentObj.bankName);      // Bank transfer — bankName
          case 5: return true;                              // PayPal — none required
          case 10: return true;                             // Payment app — none in schema
          default: return false;                            // anything else here is a programmer error
        }
      })();
      console.log('[PAYMENT METHOD MAPPING]',
        '| CRM_label:', paymentMethod,
        '| Morning_type:', paymentObj.type,
        '| Morning_type_name:', morningTypeName,
        '| Required_extra_fields_present:', requiredExtrasPresent,
        '| Payment_block:', JSON.stringify(paymentObj),
      );
    }

    console.log('[morning] Calling Morning API — docType:', morningDocType, '| order:', order.מספר_הזמנה);

    // Sanitised dump of the payment portion of the body. Token / Authorization
    // header are NOT included. This is the audit trail we use to prove what
    // Morning received vs. what it rendered.
    console.log('[MORNING PAYLOAD DEBUG]', JSON.stringify({
      documentType,
      morningType: morningDocType,
      paymentMethod: paymentMethodOverride,
      paymentMethodSource,
      payment: documentBody.payment,
      fullPaymentKeys: Object.keys(documentBody).filter(k => k.toLowerCase().includes('pay')),
    }, null, 2));

    // Full payload audit (no secrets — no token, no Authorization header).
    // Useful for tracing Morning errorCode 2422 against the exact request body.
    console.log('[MORNING FULL PAYLOAD]', JSON.stringify(documentBody, null, 2));
    console.log('[invoice-debug] Morning payload (no secrets):', JSON.stringify(documentBody));

    // ── MORNING_PAYLOAD_CHECK — required guard before EVERY Morning POST ──
    // Re-derives the gross from the documentBody about to be sent (NOT from
    // earlier intermediates), branching on isBusiness — same formula
    // `morningGrossCents()` used during reconciliation:
    //   Business (vatType:1): gross = round(sum(line.price × qty) × 1.18, 2)
    //   Retail   (vatType:0): gross =        sum(line.price × qty)
    // Asserts (against the GROSS final payable — for business that is
    // round(crmDisplayedTotal × 1.18), for private it is crmDisplayedTotal):
    //   1) computed gross === finalPayable (Morning's view of income).
    //   2) For PAYMENT_DOCS: sum(payment[].price) === finalPayable.
    //   3) Income and payment agree to the agora.
    // Any deviation refuses the POST — Morning is never called with a
    // payload that would trigger errorCode 2422.
    const finalPayable = finalPayableCents / 100;
    const guardIncome = documentBody.income as IncomeLine[];
    const guardLineSumCents = guardIncome.reduce(
      (sum, l) => sum + Math.round(l.price * l.quantity * 100),
      0,
    );
    // Same VAT branch as the line-builder above (isBusiness decides).
    const guardIncomeCents = isBusiness
      ? Math.round(guardLineSumCents * VAT_MULT)
      : guardLineSumCents;
    const guardIncomeTotal = guardIncomeCents / 100;

    const guardPayment = Array.isArray(documentBody.payment)
      ? (documentBody.payment as Array<{ type: number; price: number }>)
      : [];
    const guardPaymentCents = guardPayment.reduce(
      (sum, p) => sum + Math.round(p.price * 100),
      0,
    );
    const guardPaymentTotal = guardPaymentCents / 100;

    // tax_invoice (305) has no payment block — payment invariant vacuously
    // holds (no payment line to mismatch). For PAYMENT_DOCS (320/400) the
    // payment block MUST equal the CRM displayed total.
    const guardExpectedPaymentTotal = PAYMENT_DOCS.has(documentType)
      ? guardPaymentTotal
      : guardIncomeTotal;
    const guardIncomeVsCrmDiff = Math.round((guardIncomeTotal - finalPayable) * 100) / 100;
    const guardPaymentVsCrmDiff = PAYMENT_DOCS.has(documentType)
      ? Math.round((guardPaymentTotal - finalPayable) * 100) / 100
      : 0;
    const guardDiff = Math.round((guardIncomeTotal - guardExpectedPaymentTotal) * 100) / 100;

    const guardIncomeSummary = guardIncome
      .map((l, i) => `#${i}:net=${l.price}x${l.quantity}`)
      .join('|');
    const guardPaymentSummary = guardPayment.length
      ? guardPayment.map((p, i) => `#${i}:type${p.type}=${p.price}`).join('|')
      : 'NONE';

    console.log('MORNING_PAYLOAD_CHECK',
      '| order:', order.מספר_הזמנה,
      '| type:', documentType,
      '| isBusiness:', isBusiness,
      '| crmStoredTotal:', crmDisplayedTotal,
      '| finalPayable:', finalPayable,
      '| incomeTotal:', guardIncomeTotal,
      '| paymentTotal:', guardExpectedPaymentTotal,
      '| income_vs_crm_diff:', guardIncomeVsCrmDiff,
      '| payment_vs_crm_diff:', guardPaymentVsCrmDiff,
      '| income_vs_payment_diff:', guardDiff,
      '| incomeLineCount:', guardIncome.length,
      '| paymentLineCount:', guardPayment.length);

    if (guardIncomeVsCrmDiff !== 0 || guardPaymentVsCrmDiff !== 0 || guardDiff !== 0) {
      console.error('MORNING_PAYLOAD_MISMATCH — refusing to POST',
        '| order:', order.מספר_הזמנה,
        '| isBusiness:', isBusiness,
        '| crmStoredTotal:', crmDisplayedTotal,
        '| finalPayable:', finalPayable,
        '| incomeTotal:', guardIncomeTotal,
        '| paymentTotal:', guardExpectedPaymentTotal,
        '| income_vs_crm_diff:', guardIncomeVsCrmDiff,
        '| payment_vs_crm_diff:', guardPaymentVsCrmDiff,
        '| income_vs_payment_diff:', guardDiff,
        '| incomeSummary:', guardIncomeSummary,
        '| paymentSummary:', guardPaymentSummary);
      throw new Error(
        `אי-התאמת סכום בחשבונית לפני שליחה — הזמנה ${order.מספר_הזמנה}: ` +
        `סכום לתשלום=${finalPayable} ₪, חשבונית=${guardIncomeTotal} ₪, תשלום=${guardExpectedPaymentTotal} ₪. ` +
        `הפקת המסמך בוטלה.`,
      );
    }

    // ── [INVOICE PAYLOAD DEBUG] — required pre-POST audit ─────────────────
    // Single-line log emitted immediately before the Morning fetch with the
    // FULL income+payment payload and every total we know how to compute
    // from it (single-round and per-line, side by side). This is the trace
    // to consult when Morning rejects with 2422 despite our guard passing —
    // it tells us which formula Morning is actually applying.
    {
      const dbgIncome = documentBody.income as IncomeLine[];
      const dbgPayment = Array.isArray(documentBody.payment)
        ? (documentBody.payment as Array<{ type: number; price: number }>)
        : [];
      const dbgNetCents = dbgIncome.reduce(
        (s, l) => s + Math.round(l.price * l.quantity * 100),
        0,
      );
      const dbgIncomeGrossSingleRoundCents = Math.round(dbgNetCents * VAT_MULT);
      const dbgIncomeGrossPerLineCents = dbgIncome.reduce(
        (s, l) => s + Math.round(l.price * l.quantity * 100 * VAT_MULT),
        0,
      );
      const dbgPaymentCents = dbgPayment.reduce(
        (s, p) => s + Math.round(p.price * 100),
        0,
      );
      console.log('[INVOICE PAYLOAD DEBUG]',
        '| order_id:', orderId,
        '| order_number:', order.מספר_הזמנה,
        '| document_type:', documentType,
        '| morning_type:', morningDocType,
        '| payment_method:', paymentMethodOverride ?? 'NONE',
        '| crm_total_cents:', crmDisplayedCents,
        '| income_net_cents:', dbgNetCents,
        '| income_gross_single_round_cents:', dbgIncomeGrossSingleRoundCents,
        '| income_gross_per_line_cents:', dbgIncomeGrossPerLineCents,
        '| payment_cents:', dbgPaymentCents,
        '| income_vs_payment_diff_cents:', dbgIncomeGrossSingleRoundCents - dbgPaymentCents,
        '| income_vs_crm_diff_cents:', dbgIncomeGrossSingleRoundCents - crmDisplayedCents,
        '| per_line_vs_single_round_diff_cents:', dbgIncomeGrossPerLineCents - dbgIncomeGrossSingleRoundCents,
        '| income_lines:', JSON.stringify(dbgIncome),
        '| payment_block:', JSON.stringify(documentBody.payment ?? null),
      );
    }

    // ── [FINAL DOCUMENT BODY] — exact JSON about to be POSTed to Morning ──
    // Single line, JSON.stringify with no indent (so Logflare keeps it as
    // one searchable entry). This is the literal payload sent — if Morning
    // rejects, this is the bytes to compare against the Morning API spec.
    const finalBodyJson = JSON.stringify(documentBody);
    console.log('[FINAL DOCUMENT BODY]',
      '| order:', order.מספר_הזמנה,
      '| body:', finalBodyJson,
    );

    // ── [MORNING TOTAL DIAGNOSTICS] — every angle on the payload's math ───
    // Pure diagnostics, no functional effect. Pre-POST single-line audit
    // showing the CRM subtotal/VAT/total, line counts, both "if Morning
    // treats price as NET" vs "if Morning treats price as GROSS" reads,
    // payment sums, per-line vatTypes, and document-level vatType. This is
    // the trace to consult when Morning rejects with 2422.
    {
      const finalIncome = documentBody.income as IncomeLine[];
      const finalPayment = Array.isArray(documentBody.payment)
        ? (documentBody.payment as Array<{ type: number; price: number }>)
        : [];
      const sumPriceTimesQty = finalIncome.reduce(
        (s, l) => s + Math.round(l.price * l.quantity * 100),
        0,
      ) / 100;
      const sumPriceOnly = finalIncome.reduce(
        (s, l) => s + Math.round(l.price * 100),
        0,
      ) / 100;
      const expectedIfTreatedAsNet = Math.round(
        finalIncome.reduce(
          (s, l) => s + Math.round(l.price * l.quantity * 100),
          0,
        ) * VAT_MULT,
      ) / 100;
      const expectedIfTreatedAsGross = sumPriceTimesQty;
      const sumPaymentPrice = finalPayment.reduce(
        (s, p) => s + Math.round(p.price * 100),
        0,
      ) / 100;
      const crmSubtotalBeforeVat = Math.round(crmDisplayedCents / VAT_MULT) / 100;
      const crmVat = (crmDisplayedCents - Math.round(crmDisplayedCents / VAT_MULT)) / 100;
      console.log('[MORNING TOTAL DIAGNOSTICS]',
        '| order_id:', orderId,
        '| order_number:', order.מספר_הזמנה,
        '| document_type:', documentType,
        '| documentBody.type:', documentBody.type,
        '| documentBody.vatType:', documentBody.vatType,
        '| crm_subtotal_before_vat:', crmSubtotalBeforeVat,
        '| crm_vat:', crmVat,
        '| crm_total:', crmDisplayedTotal,
        '| income_lines_count:', finalIncome.length,
        '| sum_income_raw_price:', sumPriceOnly,
        '| sum_income_quantity_times_price:', sumPriceTimesQty,
        '| expected_gross_if_NET:', expectedIfTreatedAsNet,
        '| expected_gross_if_GROSS:', expectedIfTreatedAsGross,
        '| sum_payment_price:', sumPaymentPrice,
        '| selected_payment_method:', paymentMethodOverride ?? 'NONE',
        '| debug_morning_mode:', debugMorningMode,
        '| income_lines_vatTypes:', JSON.stringify(finalIncome.map((l) => l.vatType)),
        '| income_lines:', JSON.stringify(finalIncome),
        '| payment_block:', JSON.stringify(documentBody.payment ?? null),
      );
    }

    // ── [MORNING PRIMARY PAYLOAD] — exact bytes of the primary attempt ────
    console.log('[MORNING PRIMARY PAYLOAD]',
      '| order:', order.מספר_הזמנה,
      '| body:', finalBodyJson,
    );

    const morningPost = async (jsonBody: string) => {
      const res = await fetch(`${MORNING_API_BASE}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: jsonBody,
      });
      const data = await res.json();
      return { res, data };
    };

    let { res: docRes, data: docData } = await morningPost(finalBodyJson);
    console.log('[morning] Response status:', docRes.status, '| body:', JSON.stringify(docData).slice(0, 300));

    let usedFallback = false;
    let fallbackBodyJson: string | null = null;

    // ── Single-line fallback on errorCode 2422 ────────────────────────────
    // The detailed line breakdown (products + delivery merge + discount +
    // credit + עיגול correction) can still trip Morning's receipt validator
    // for reasons we cannot fully introspect from the outside (e.g. its
    // shipping-bucket allocation). When that happens, retry ONCE with the
    // most stable shape Morning accepts: a single net income line whose
    // gross equals the CRM total exactly, plus the same payment block.
    //
    // The customer-facing CRM preview and order page still show the full
    // breakdown — only Morning's wire payload collapses to one line for
    // legal-document issuance reliability.
    if (
      !docRes.ok &&
      (docData?.errorCode === 2422 ||
        (typeof docData?.errorMessage === 'string' &&
          docData.errorMessage.includes('סכום התקבולים')))
    ) {
      // Single-line fallback price is the raw CRM amount (crmDisplayedCents)
      // for BOTH modes — the document-level vatType decides the gross:
      //   Business (doc vatType:1): price is the NET; Morning adds 18% →
      //     gross = round(crmDisplayedCents × 1.18) = the final payable.
      //   Retail   (doc vatType:0): price is the GROSS, taken as-is.
      const fallbackLineCents = crmDisplayedCents;
      const fallbackBody: Record<string, unknown> = {
        ...documentBody,
        income: [
          {
            description: 'סך הכל הזמנה',
            quantity: 1,
            price: fallbackLineCents / 100,
            vatType: 1,
          },
        ],
        // Keep documentBody.payment as-is. Same payment object (same type,
        // same crmDisplayedTotal price, same date/currency) — the issue is
        // line shape, not payment shape.
      };
      fallbackBodyJson = JSON.stringify(fallbackBody);
      console.warn(
        '[MORNING FALLBACK PAYLOAD]',
        '| order:', order.מספר_הזמנה,
        '| triggered_by_error_code:', docData?.errorCode ?? 'none',
        '| body:', fallbackBodyJson,
      );
      const fallback = await morningPost(fallbackBodyJson);
      docRes = fallback.res;
      docData = fallback.data;
      usedFallback = true;
      console.log('[morning] Fallback response status:', docRes.status, '| body:', JSON.stringify(docData).slice(0, 300));
    }

    // ── [MORNING FINAL RESULT] — single line summarizing the outcome ──────
    console.log('[MORNING FINAL RESULT]',
      '| order:', order.מספר_הזמנה,
      '| used_fallback:', usedFallback,
      '| http_status:', docRes.status,
      '| ok:', docRes.ok,
      '| error_code:', docData?.errorCode ?? 'none',
      '| error_message:', docData?.errorMessage ?? 'none',
      '| invoice_number:', docData?.number ?? docData?.id ?? 'none',
    );

    if (!docRes.ok) {
      // ── [MORNING RAW ERROR] — raw response audit on non-2xx ──────────────
      // Single-line log capturing HTTP status, full response body, and a
      // stable hash of the request body for correlation with [FINAL
      // DOCUMENT BODY]. JSON.stringify(docData) covers the response payload
      // even when Morning returns a typed errorCode + errorMessage struct.
      const lastBody = fallbackBodyJson ?? finalBodyJson;
      const bodyHash = Array.from(lastBody).reduce(
        (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
        0,
      );
      console.error('[MORNING RAW ERROR]',
        '| order:', order.מספר_הזמנה,
        '| http_status:', docRes.status,
        '| used_fallback:', usedFallback,
        '| response_body:', JSON.stringify(docData),
        '| request_body_hash:', bodyHash,
        '| request_body_length:', lastBody.length,
        '| request_body:', lastBody,
      );
      throw new Error(`Morning API failed ${docRes.status}: ${JSON.stringify(docData)}`);
    }

    const invoiceNumber: string = docData.number ?? docData.id ?? String(docData.documentId ?? '');
    const docId: string = docData.id ?? '';
    const invoiceUrl: string =
      docData.shareLink ??
      docData.viewUrl ??
      docData.documentUrl ??
      (docId ? `https://app.greeninvoice.co.il/ext/d/${docId}` : '') ??
      '';

    console.log('[morning] Invoice URL:', invoiceUrl || 'none');

    const { data: savedInvoice, error: saveErr } = await supabase
      .from('חשבוניות')
      .insert({
        הזמנה_id: orderId,
        לקוח_id: order.לקוח_id,
        מספר_חשבונית: invoiceNumber,
        קישור_חשבונית: invoiceUrl || null,
        סכום: paymentAmount,
        סטטוס: 'הופקה',
        סוג_מסמך: documentType,
      })
      .select('id')
      .single();

    if (saveErr) throw new Error(`Failed to save to DB: ${saveErr.message}`);

    console.log('[morning] Saved — id:', savedInvoice?.id, '| type:', documentType, '| number:', invoiceNumber);

    return new Response(
      JSON.stringify({ success: true, invoice_id: savedInvoice?.id, invoice_number: invoiceNumber, document_type: documentType }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[morning] ERROR:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
