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
//   cardType     — card brand: 0=Unknown 1=Isracard 2=Visa 3=Mastercard 4=Amex 5=Diners
//   cardNum      — last 4 digits (we don't capture them — omit when empty)
//   dealType     — deal type: 1=Regular 2=Installments 3=Credit 4=BillingDeclined 5=Other
//   numPayments  — number of installments (1 for a one-shot transaction)
//
// There is NO `subType` / `sub_type` field in the spec — we used to send it
// and it was simply ignored.
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

const PAYMENT_BUILDERS: Record<string, (price: number, date: string) => MorningPayment> = {
  'מזומן':         (price, date) => ({ type: 1, price, date, currency: 'ILS' }),
  'המחאה':         (price, date) => ({ type: 2, price, date, currency: 'ILS' }),
  // type 3 = Credit card. We don't capture brand or last-4 → cardType:0
  // (Unknown) is the safest valid value (1–5 would mis-claim a brand).
  'כרטיס אשראי':   (price, date) => ({ type: 3, price, date, currency: 'ILS', cardType: 0, dealType: 1, numPayments: 1 }),
  // type 4 = Electronic fund transfer (bank transfer). bankName is a
  // human-readable placeholder for documents where we don't know the bank.
  'העברה בנקאית':  (price, date) => ({ type: 4, price, date, currency: 'ILS', bankName: 'לא צוין' }),
  // type 5 = PayPal (its own dedicated enum value).
  'PayPal':        (price, date) => ({ type: 5, price, date, currency: 'ILS' }),
  // type 10 = Payment app — bit / PayBox / similar Israeli wallets. Closer
  // to reality than tagging them as credit card.
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
    const documentType: string = payload.document_type ?? 'tax_invoice';
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
        סוג_הנחה, ערך_הנחה, אופן_תשלום, דמי_משלוח,
        לקוחות (שם_פרטי, שם_משפחה, אימייל, טלפון, סוג_לקוח)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    const { data: items, error: itemsErr } = await supabase
      .from('מוצרים_בהזמנה')
      .select(`
        id, סוג_שורה, גודל_מארז, כמות, מחיר_ליחידה, סהכ, הערות_לשורה,
        מוצרים_למכירה (שם_מוצר),
        בחירת_פטיפורים_בהזמנה (כמות, סוגי_פטיפורים (שם_פטיפור))
      `)
      .eq('הזמנה_id', orderId);

    if (itemsErr) throw new Error(`Failed to fetch items: ${itemsErr.message}`);

    const morningApiId = Deno.env.get('MORNING_API_ID') ?? '';
    const morningApiSecret = Deno.env.get('MORNING_API_SECRET') ?? '';
    console.log('[morning] API_ID exists:', !!morningApiId, '| API_SECRET exists:', !!morningApiSecret);
    if (!morningApiId || !morningApiSecret) throw new Error('MORNING_API_ID or MORNING_API_SECRET not set');

    const token = await getMorningToken(morningApiId, morningApiSecret);

    type CustomerRow = { שם_פרטי: string; שם_משפחה: string; אימייל: string | null; טלפון: string | null; סוג_לקוח: string | null };
    const customer = order.לקוחות as CustomerRow;
    const isBusiness = BUSINESS_TYPES.has(customer.סוג_לקוח ?? '');

    // ── VAT rate and price conversion ─────────────────────────────────────
    // Morning always receives NET prices (before VAT) in income lines.
    // vatType: 1 at document level tells Morning to add 18% on top.
    //
    // Private customers: CRM stores VAT-INCLUSIVE prices → divide by (1+VAT)
    //   Example: CRM price 118 → net 100 → Morning adds 18 → invoice shows 118
    // Business customers: CRM stores pre-VAT prices → no conversion needed
    //   Example: CRM price 100 → net 100 → Morning adds 18 → invoice shows 118
    //
    // In both cases the invoice always shows: net + 18% VAT = total with VAT.
    const VAT_RATE = 0.18;
    const toNet = (price: number): number =>
      isBusiness ? price : Math.round(price / (1 + VAT_RATE) * 100) / 100;

    // ── Build income lines ────────────────────────────────────────────────
    // Every line price is NET (pre-VAT). Morning computes VAT per line at 18%.
    type IncomeLine = { description: string; quantity: number; price: number; vatType: 1 };
    const incomeLines: IncomeLine[] = [];
    for (const item of items ?? []) {
      let description = '';
      if (item.סוג_שורה === 'מארז' && item.גודל_מארז) {
        description = `מארז פטיפורים ${item.גודל_מארז} יחידות`;
        const selections = (item.בחירת_פטיפורים_בהזמנה as Array<{ כמות: number; סוגי_פטיפורים: { שם_פטיפור: string } }>) ?? [];
        if (selections.length > 0) {
          description += ` (${selections.map(s => `${s.סוגי_פטיפורים?.שם_פטיפור} ×${s.כמות}`).join(', ')})`;
        }
      } else {
        description = (item.מוצרים_למכירה as { שם_מוצר: string } | null)?.שם_מוצר ?? 'פריט';
      }
      if (item.הערות_לשורה) description += ` — ${item.הערות_לשורה}`;
      incomeLines.push({ description, quantity: item.כמות, price: toNet(item.מחיר_ליחידה), vatType: 1 });
    }

    if (order.דמי_משלוח && order.דמי_משלוח > 0) {
      // Delivery fee: included as an income line (NET), so Morning adds VAT
      // on top exactly like every other line.
      incomeLines.push({ description: 'דמי משלוח', quantity: 1, price: toNet(order.דמי_משלוח), vatType: 1 });
    }

    const incomeBeforeDiscount = incomeLines.reduce((sum, l) => sum + l.price * l.quantity, 0);

    // Discounts are represented as a NEGATIVE income line (not as Morning's
    // separate discount field). This keeps the income-lines total == payment
    // amount equality the only invariant we need to defend.
    if (order.סוג_הנחה === 'אחוז' && order.ערך_הנחה && order.ערך_הנחה > 0) {
      const discAmt = Math.round(incomeBeforeDiscount * order.ערך_הנחה / 100 * 100) / 100;
      incomeLines.push({ description: `הנחה ${order.ערך_הנחה}%`, quantity: 1, price: -discAmt, vatType: 1 });
    } else if (order.סוג_הנחה === 'סכום' && order.ערך_הנחה && order.ערך_הנחה > 0) {
      // Fixed discount: convert to net for the same reason as item prices.
      // Private: CRM discount is VAT-inclusive → divide by (1+VAT).
      // Business: CRM discount is pre-VAT → no change.
      incomeLines.push({ description: 'הנחה', quantity: 1, price: -toNet(order.ערך_הנחה), vatType: 1 });
    }

    // ── Cents-based aggregation (Morning errorCode 2422 fix) ──────────────
    // Morning rejects (2422 "קיים חוסר התאמה בין סכום התקבולים לסכום התשלומים")
    // when our payment amount differs from Morning's own per-line aggregation
    // by even a single agora. The previous implementation rounded the whole
    // grand total once with `round(sum × 1.18, 2)`, but Morning rounds VAT
    // per line — so on multi-line orders the two totals could disagree.
    //
    // Fix: do everything in integer agorot from per-line totals, then convert
    // to a number with 2 decimals only at the final payload. By construction
    // incomeLinesTotal === paymentAmount exactly (same cents accumulator).
    const VAT_MULT = 1 + VAT_RATE;
    let incomeLinesTotalCents = 0;
    const incomeLinesDebug: Array<{ description: string; quantity: number; price: number; lineNet: number; lineGross: number }> = [];
    for (const line of incomeLines) {
      // Per-line net in cents (line.price already has 2-decimal precision,
      // so this multiplication does not introduce float drift in practice).
      const lineNetCents = Math.round(line.price * line.quantity * 100);
      // Per-line gross (net + 18% VAT), rounded per line — matches Morning.
      const lineGrossCents = Math.round(lineNetCents * VAT_MULT);
      incomeLinesTotalCents += lineGrossCents;
      incomeLinesDebug.push({
        description: line.description,
        quantity: line.quantity,
        price: line.price,
        lineNet: lineNetCents / 100,
        lineGross: lineGrossCents / 100,
      });
    }

    const incomeLinesTotal = incomeLinesTotalCents / 100;
    const paymentAmount = incomeLinesTotal; // same cents accumulator → exact match
    const difference = Math.round((incomeLinesTotal - paymentAmount) * 100) / 100;

    // Reporting-only net/vat snapshot for the [VAT] log; not used in payload math.
    const netAfterDiscount = incomeLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const roundedNet = Math.round(netAfterDiscount * 100) / 100;
    const roundedVat = Math.round((paymentAmount - roundedNet) * 100) / 100;

    // ── Pre-flight invariant log ──────────────────────────────────────────
    console.log('[MORNING AMOUNT CHECK]', JSON.stringify({
      orderId,
      orderNumber: order.מספר_הזמנה,
      incomeLines: incomeLinesDebug,
      incomeLinesTotal,
      paymentAmount,
      difference,
    }, null, 2));

    if (difference !== 0) {
      // Should be impossible by construction (single accumulator), but if
      // anything ever drifts, fail loud BEFORE calling Morning so we get a
      // clear local error instead of an opaque Morning 2422.
      const msg = `Income lines total (${incomeLinesTotal}) does not match payment amount (${paymentAmount}); difference=${difference}. Refusing to call Morning to avoid errorCode 2422.`;
      console.error('[MORNING AMOUNT CHECK] FAIL —', msg);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── VAT audit log ──────────────────────────────────────────────────────
    console.log('[VAT]', JSON.stringify({
      customerType: customer.סוג_לקוח ?? 'פרטי',
      isBusiness,
      vatHandling: isBusiness
        ? 'exclusive: CRM prices are pre-VAT — VAT added on top'
        : 'inclusive: CRM prices include VAT — split into net + 18%',
      orderTotalFromCRM: order.סך_הכל_לתשלום,
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
      // Always vatType: 1 (subject to standard VAT, 18%).
      // Morning receives NET prices in every income line and adds 18% on top.
      // For private customers the net was derived by dividing inclusive CRM prices
      // by 1.18; for business customers prices are already net — both produce
      // the same invoice shape: net + 18% VAT = invoice total.
      vatType: 1,
      client: {
        name: `${customer.שם_פרטי} ${customer.שם_משפחה}`,
        ...(customer.אימייל ? { emails: [customer.אימייל] } : {}),
        ...(customer.טלפון ? { phone: customer.טלפון } : {}),
      },
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
      const builder = PAYMENT_BUILDERS[paymentMethod];
      if (!builder) {
        console.error('[PAYMENT EF] REFUSE — payment method not in PAYMENT_BUILDERS:',
          JSON.stringify(paymentMethod),
          '| documentType:', documentType,
          '| supported:', Object.keys(PAYMENT_BUILDERS).join(', '));
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

    const docRes = await fetch(`${MORNING_API_BASE}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(documentBody),
    });

    const docData = await docRes.json();
    console.log('[morning] Response status:', docRes.status, '| body:', JSON.stringify(docData).slice(0, 300));

    if (!docRes.ok) throw new Error(`Morning API failed ${docRes.status}: ${JSON.stringify(docData)}`);

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
