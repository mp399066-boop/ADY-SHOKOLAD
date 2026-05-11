import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

// Morning document type codes
const DOC_TYPE: Record<string, number> = {
  tax_invoice: 305, // חשבונית מס — income lines, no payment section
  receipt: 400,     // קבלה — income lines + payment section
};

// Payment builders for Morning's documents API. Each entry returns the full
// payment object (not just a type code) because Morning needs the matching
// extra fields per type — sending a bare {type, price, date} for credit card
// caused the document to display the wrong method (the "כרטיס אשראי שיצא
// כהעברה" bug). The previous version had a `?? 4` fallback that silently
// labelled any unknown method as credit card; that fallback is gone — see
// the lookup site for what happens when the method is unknown/empty.
//
// Field meanings (Morning v1 /documents):
//   subType  — credit-card sub-type: 0=normal, 1=installments, 2=credit
//   cardType — card brand: 1=Isracard 2=Visa 3=Mastercard 4=Diners 5=Amex 6=Other
//   cardNum  — last 4 digits (we don't capture them, sent as empty string)
//   bankName — required for type 3 to render readably; placeholder is fine
type MorningPayment = {
  type: number;
  price: number;
  date: string;
  subType?: number;
  cardType?: number;
  cardNum?: string;
  bankName?: string;
};

const PAYMENT_BUILDERS: Record<string, (price: number, date: string) => MorningPayment> = {
  'מזומן':         (price, date) => ({ type: 1, price, date }),
  'המחאה':         (price, date) => ({ type: 2, price, date }),
  'העברה בנקאית':  (price, date) => ({ type: 3, price, date, bankName: 'לא צוין' }),
  'כרטיס אשראי':   (price, date) => ({ type: 4, price, date, subType: 0, cardType: 6, cardNum: '' }),
  // bit/PayBox/PayPal go on type 4 (credit card) too — Morning v1 doesn't
  // have dedicated codes for them. Same brand:6 (other) so the document
  // doesn't claim a brand we don't actually know.
  'bit':           (price, date) => ({ type: 4, price, date, subType: 0, cardType: 6, cardNum: '' }),
  'PayBox':        (price, date) => ({ type: 4, price, date, subType: 0, cardType: 6, cardNum: '' }),
  'PayPal':        (price, date) => ({ type: 4, price, date, subType: 0, cardType: 6, cardNum: '' }),
};

// Business customer types require exclusive VAT (vatType 1 at document level)
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
    // document_type: 'tax_invoice' (on completion) | 'receipt' (on payment)
    const documentType: string = payload.document_type ?? 'tax_invoice';
    const morningDocType = DOC_TYPE[documentType];
    if (!morningDocType) {
      return new Response(JSON.stringify({ error: `Unknown document_type: ${documentType}` }), { status: 400 });
    }

    console.log('[morning] Received — document_type:', documentType, '| type:', payload.type);

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

    // Idempotency: per order + document type
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

    // Build income lines
    const incomeLines: object[] = [];
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
      incomeLines.push({ description, quantity: item.כמות, price: item.מחיר_ליחידה, vatType: 1 });
    }

    if (order.דמי_משלוח && order.דמי_משלוח > 0) {
      incomeLines.push({ description: 'דמי משלוח', quantity: 1, price: order.דמי_משלוח, vatType: 1 });
    }

    const incomeBeforeDiscount = (incomeLines as Array<{ price: number; quantity: number }>)
      .reduce((sum, l) => sum + l.price * l.quantity, 0);

    if (order.סוג_הנחה === 'אחוז' && order.ערך_הנחה && order.ערך_הנחה > 0) {
      const discAmt = Math.round(incomeBeforeDiscount * order.ערך_הנחה / 100 * 100) / 100;
      incomeLines.push({ description: `הנחה ${order.ערך_הנחה}%`, quantity: 1, price: -discAmt, vatType: 1 });
    } else if (order.סוג_הנחה === 'סכום' && order.ערך_הנחה && order.ערך_הנחה > 0) {
      incomeLines.push({ description: 'הנחה', quantity: 1, price: -order.ערך_הנחה, vatType: 1 });
    }

    const paymentAmount = Math.round(
      (incomeLines as Array<{ price: number; quantity: number }>)
        .reduce((sum, l) => sum + l.price * l.quantity, 0) * 100
    ) / 100;

    console.log('[morning] document_type:', documentType, '| morningType:', morningDocType, '| isBusiness:', isBusiness, '| paymentAmount:', paymentAmount);

    const documentBody: Record<string, unknown> = {
      description: `הזמנה ${order.מספר_הזמנה}`,
      type: morningDocType,
      date: new Date().toISOString().slice(0, 10),
      lang: 'he',
      currency: 'ILS',
      // Business: prices are pre-VAT (exclusive), Morning adds 18%.
      // Retail: prices include VAT (inclusive).
      vatType: isBusiness ? 1 : 0,
      client: {
        name: `${customer.שם_פרטי} ${customer.שם_משפחה}`,
        ...(customer.אימייל ? { emails: [customer.אימייל] } : {}),
        ...(customer.טלפון ? { phone: customer.טלפון } : {}),
      },
      income: incomeLines,
    };

    // Receipt includes payment section; tax invoice does not.
    // Build the payment block from PAYMENT_BUILDERS — refuse to invent a
    // method when אופן_תשלום is missing/unknown. Without a valid builder we
    // skip the payment block entirely; Morning will reject the document with
    // a clear error rather than issuing a receipt under the wrong method,
    // which is the safer failure mode (visible error vs silently mislabelled
    // receipt that the customer sees).
    if (documentType === 'receipt') {
      const paymentMethod = (order.אופן_תשלום ?? '').trim();
      const builder = PAYMENT_BUILDERS[paymentMethod];
      if (builder) {
        documentBody.payment = [builder(paymentAmount, new Date().toISOString().slice(0, 10))];
      } else {
        console.warn('[morning] Unknown / missing אופן_תשלום:', JSON.stringify(paymentMethod),
          '— skipping payment block. Morning will reject and the order needs to be fixed.');
      }
    }

    console.log('[morning] Calling Morning API — docType:', morningDocType, '| order:', order.מספר_הזמנה);

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
