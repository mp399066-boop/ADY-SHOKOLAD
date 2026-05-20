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
// IMPORTANT — DO NOT use Morning type 3 (credit card) for the CRM's generic
// "כרטיס אשראי" payment method:
//
//   The CRM currently stores only "כרטיס אשראי" as a payment method, not
//   actual card brand / transaction metadata (cardType=1..5, cardNum last
//   4 digits, dealType, numPayments) required by Morning. Without that
//   real metadata, Morning's /documents receipt validator silently drops
//   the payment line — its sum becomes 0 against the invoice income and
//   the request fails with errorCode 2422:
//     "קיים חוסר התאמה בין סכום התקבולים לסכום התשלומים"
//   Empirically verified across three permutations (all produced 2422):
//     • cardType:0 ("Unknown")           → rejected
//     • cardType omitted                 → rejected
//     • cardType:3 (Mastercard generic)  → rejected
//   Morning genuinely requires real card data on type 3 receipts.
//
//   The safe accepted fallback is Morning type 11 (Other / "אחר"), which
//   takes price+date+currency only and is reliably counted as a valid
//   receipt. We intentionally route "כרטיס אשראי" through type 11 until
//   the CRM captures real card metadata (brand + last-4 from an acquirer
//   webhook or operator input). The CRM-side label / logs / invoice
//   description still read "כרטיס אשראי"; only Morning's wire `type` code
//   changes.
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

const PAYMENT_BUILDERS: Record<string, (price: number, date: string) => MorningPayment> = {
  'מזומן':         (price, date) => ({ type: 1, price, date, currency: 'ILS' }),
  'המחאה':         (price, date) => ({ type: 2, price, date, currency: 'ILS' }),
  // The CRM stores only "כרטיס אשראי" (no brand, no last-4, no dealType,
  // no acquirer data), so we route to Morning type 11 (Other) instead of
  // type 3 — see long-form rationale block above. Switch back to type 3
  // once real card metadata is captured upstream.
  'כרטיס אשראי':   (price, date) => ({ type: 11, price, date, currency: 'ILS' }),
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

    // ── Preview total — the single source of truth ────────────────────────
    // The invoice preview modal (orders/[id]/page.tsx, InvoicePreviewModal)
    // takes `order.סך_הכל_לתשלום` AS-IS as the final gross total, then splits
    // it into net + VAT 18% backwards:
    //     total   = order.סך_הכל_לתשלום
    //     vatAmt  = round(total * 0.18 / 1.18, 2)
    //     exclVat = total - vatAmt
    // The invoice we send to Morning MUST equal that same number to the
    // agora. Customer type does NOT enter this calculation — whatever the
    // preview shows is the contract. Any drift between Morning's per-line
    // rounding and `crmDisplayedTotal` is closed by a single "עיגול"
    // reconciliation line below, then asserted by a hard pre-flight guard.
    const VAT_RATE = 0.18;
    const VAT_MULT = 1 + VAT_RATE;
    // Every CRM amount (line price, delivery, discount, credit) is treated
    // as VAT-inclusive — same convention the preview uses. Morning still
    // wants NET prices in income lines (it adds 18% via vatType:1), so we
    // divide once at the boundary.
    const toNet = (gross: number): number =>
      Math.round(gross / VAT_MULT * 100) / 100;

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
      incomeLines.push({ description, quantity: qty, price: toNet(unit), vatType: 1 });
    }

    // Delivery fee — exactly one line.
    if (order.דמי_משלוח && Number(order.דמי_משלוח) > 0) {
      incomeLines.push({ description: 'דמי משלוח', quantity: 1, price: toNet(Number(order.דמי_משלוח)), vatType: 1 });
    }

    // Discount — exactly one line (percent OR fixed; never both).
    const discValue = Number(order.ערך_הנחה ?? 0);
    if (order.סוג_הנחה === 'אחוז' && discValue > 0) {
      const netBeforeDiscount = incomeLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
      const discNet = Math.round(netBeforeDiscount * discValue / 100 * 100) / 100;
      incomeLines.push({ description: `הנחה ${discValue}%`, quantity: 1, price: -discNet, vatType: 1 });
    } else if (order.סוג_הנחה === 'סכום' && discValue > 0) {
      incomeLines.push({ description: 'הנחה', quantity: 1, price: -toNet(discValue), vatType: 1 });
    }

    // Customer credit usage — already baked into סך_הכל_לתשלום at order time.
    // Surface it as an explicit deduction line so the customer-facing invoice
    // matches the CRM total without needing a generic rounding fudge.
    const creditUsed = Number((order as Record<string, unknown>).זיכוי_בשימוש ?? 0);
    if (creditUsed > 0) {
      incomeLines.push({ description: 'זיכוי לקוחה', quantity: 1, price: -toNet(creditUsed), vatType: 1 });
    }

    // ── Reconcile NET SUM to single-round( × 1.18 ) = crmDisplayedCents ───
    // Morning's invoice-totaling matches Israeli convention:
    //     VAT      = round(sum_net × 0.18, 2)
    //     gross    = sum_net + VAT      ≡ round(sum_net × 1.18, 2)
    // (Single round on the NET SUM, not per-line — that's why the CRM
    // preview shows e.g. net 278.81 → VAT 50.19 → total 329.00, even though
    // a per-line calculation on the same items would give 329.10.)
    //
    // Therefore the only invariant that makes Morning happy is:
    //     round( sum_i(line_i.price × line_i.qty) × 1.18 , 2 )  ===  payment
    // The previous per-line reconciliation pushed the net sum off by a few
    // agorot to chase a per-line gross target, which made Morning's
    // single-round of that net sum land 1–3 agorot higher than the payment.
    //
    // Fix: pick the net sum directly. target_net_cents = round(crmCents /
    // 1.18). Add exactly one "עיגול" net line (price = diff / 100) so the
    // final net sum equals target_net_cents. Morning's single-round of that
    // net then equals crmDisplayedCents to the agora.
    const singleRoundGrossCents = (lines: IncomeLine[]): number => {
      const netCents = lines.reduce(
        (sum, l) => sum + Math.round(l.price * l.quantity * 100),
        0,
      );
      return Math.round(netCents * VAT_MULT);
    };

    const actualNetCents = incomeLines.reduce(
      (sum, l) => sum + Math.round(l.price * l.quantity * 100),
      0,
    );
    // Pick target net so that round(target × 1.18) === crmDisplayedCents.
    // Math.round(crmCents / 1.18) lands on the correct integer for every
    // reachable gross; if a gross is "unreachable" the guard below catches
    // it before the POST.
    const targetNetCents = Math.round(crmDisplayedCents / VAT_MULT);
    const correctionCents = targetNetCents - actualNetCents;
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
    // by construction (this is the contract).
    const finalNetCents = incomeLines.reduce(
      (sum, l) => sum + Math.round(l.price * l.quantity * 100),
      0,
    );
    const finalGrossCents = Math.round(finalNetCents * VAT_MULT);
    const incomeLinesTotal = finalGrossCents / 100;
    const paymentAmount = crmDisplayedTotal;
    const mismatchCents = finalGrossCents - crmDisplayedCents;
    const totalCorrectionGrossCents = correctionCents !== 0
      ? Math.round((targetNetCents * VAT_MULT) - (actualNetCents * VAT_MULT))
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

    const roundedNet = finalNetCents / 100;
    const roundedVat = Math.round((finalGrossCents - finalNetCents)) / 100;

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

    // ── Hard pre-flight guard — refuse to call Morning on mismatch ────────
    // After the reconciliation line above, mismatchCents must be exactly 0.
    // If it isn't, the input data is corrupt enough that we should stop
    // rather than ship a wrong-amount invoice to the tax authority.
    if (mismatchCents !== 0) {
      console.error('[INVOICE GUARD] MISMATCH — refusing to send',
        '| order:', order.מספר_הזמנה,
        '| computed_gross:', incomeLinesTotal,
        '| expected_CRM_total:', crmDisplayedTotal,
        '| diff_cents:', mismatchCents,
        '| lines:', JSON.stringify(incomeLinesDebug));
      throw new Error(
        `אי-התאמת סכום בחשבונית: סך הכל בחשבונית ${incomeLinesTotal.toFixed(2)} ₪ ` +
        `שונה מהסכום בהזמנה ${crmDisplayedTotal.toFixed(2)} ₪. ` +
        `הפרש: ${(mismatchCents / 100).toFixed(2)} ₪. החשבונית לא הופקה.`,
      );
    }

    // ── [invoice-debug] — sanitized payload calculation dump ──────────────
    // CRITICAL: every log here is a SINGLE-LINE string. Multi-line JSON
    // (JSON.stringify with indent) was getting split by Supabase's Logflare
    // pipeline so the dashboard search "[invoice-debug]" missed everything
    // after the first line. No null/2 pretty-print below.
    console.log('[invoice-debug] VERSION: credit-card-route-to-type11-other-2422-fix-v9');
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
      // Always vatType: 1 (subject to standard VAT, 18%).
      // Morning receives NET prices in every income line and adds 18% on top.
      // Every CRM amount (line price, delivery, discount, credit) is treated
      // as VAT-inclusive — same as the invoice preview — so net = gross / 1.18.
      // Final invoice gross == order.סך_הכל_לתשלום, regardless of customer type.
      vatType: 1,
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
    console.log('[invoice-debug] Morning payload (no secrets):', JSON.stringify(documentBody));

    // ── MORNING_PAYLOAD_CHECK — required guard before EVERY Morning POST ──
    // Re-derives the gross from the documentBody about to be sent (NOT from
    // earlier intermediates), using Morning's SINGLE-ROUND-ON-NET-SUM formula:
    //     income gross = round( sum_i(line_i.price × qty_i) × 1.18 , 2 )
    // (Same formula `singleRoundGrossCents` used during reconciliation.)
    // Asserts:
    //   1) single-round gross === crmDisplayedTotal (Morning's view of income).
    //   2) For PAYMENT_DOCS: sum(payment[].price) === crmDisplayedTotal.
    //   3) Income and payment agree to the agora.
    // Any deviation refuses the POST — Morning is never called with a
    // payload that would trigger errorCode 2422.
    const guardIncome = documentBody.income as IncomeLine[];
    const guardNetCents = guardIncome.reduce(
      (sum, l) => sum + Math.round(l.price * l.quantity * 100),
      0,
    );
    const guardIncomeCents = Math.round(guardNetCents * VAT_MULT);
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
    const guardIncomeVsCrmDiff = Math.round((guardIncomeTotal - crmDisplayedTotal) * 100) / 100;
    const guardPaymentVsCrmDiff = PAYMENT_DOCS.has(documentType)
      ? Math.round((guardPaymentTotal - crmDisplayedTotal) * 100) / 100
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
      '| crmDisplayedTotal:', crmDisplayedTotal,
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
        '| crmDisplayedTotal:', crmDisplayedTotal,
        '| incomeTotal:', guardIncomeTotal,
        '| paymentTotal:', guardExpectedPaymentTotal,
        '| income_vs_crm_diff:', guardIncomeVsCrmDiff,
        '| payment_vs_crm_diff:', guardPaymentVsCrmDiff,
        '| income_vs_payment_diff:', guardDiff,
        '| incomeSummary:', guardIncomeSummary,
        '| paymentSummary:', guardPaymentSummary);
      throw new Error(
        `אי-התאמת סכום בחשבונית לפני שליחה — הזמנה ${order.מספר_הזמנה}: ` +
        `CRM=${crmDisplayedTotal} ₪, חשבונית=${guardIncomeTotal} ₪, תשלום=${guardExpectedPaymentTotal} ₪. ` +
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
    console.log('[FINAL DOCUMENT BODY]',
      '| order:', order.מספר_הזמנה,
      '| body:', JSON.stringify(documentBody),
    );

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
