import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MORNING_AUTH_BASE = 'https://api.morning.co';
const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

const PAYMENT_TYPE_MAP: Record<string, number> = {
  מזומן: 1,
  המחאה: 2,
  'העברה בנקאית': 3,
  'כרטיס אשראי': 4,
};

async function getMorningToken(apiId: string, apiSecret: string): Promise<string> {
  console.log('USING GREEN INVOICE AUTH');
  const authUrl = `${MORNING_API_BASE}/account/token`;
  console.log('[create-morning-invoice] Auth URL:', authUrl);

  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: apiId, secret: apiSecret }),
  });

  const rawBody = await res.text();
  console.log('[create-morning-invoice] Auth response status:', res.status);
  console.log('[create-morning-invoice] Auth response body:', rawBody.slice(0, 300));

  if (!res.ok) {
    throw new Error(`Morning auth failed ${res.status}: ${rawBody}`);
  }
  const data = JSON.parse(rawBody);
  const accessToken = data.token;
  if (!accessToken) throw new Error(`Morning auth: no token in response. Keys: ${Object.keys(data).join(', ')}`);
  return accessToken;
}

serve(async (req: Request) => {
  try {
    // Validate webhook secret (passed in x-webhook-secret; Authorization is used by Supabase gateway)
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    const incomingSecret = req.headers.get('x-webhook-secret') ?? '';
    if (!webhookSecret || incomingSecret !== webhookSecret) {
      console.error('[create-morning-invoice] Unauthorized — x-webhook-secret mismatch');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const payload = await req.json();
    console.log('[create-morning-invoice] Received webhook:', JSON.stringify({
      type: payload.type,
      table: payload.table,
      new_status: payload.record?.סטטוס_תשלום,
      old_status: payload.old_record?.סטטוס_תשלום,
    }));

    // Only process UPDATE events where status changed to שולם
    if (payload.type !== 'UPDATE') {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'not UPDATE' }), { status: 200 });
    }
    const newRecord = payload.record;
    const oldRecord = payload.old_record;
    if (newRecord?.סטטוס_תשלום !== 'שולם') {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'status not שולם' }), { status: 200 });
    }
    if (oldRecord?.סטטוס_תשלום === 'שולם') {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'was already שולם' }), { status: 200 });
    }

    const orderId: string = newRecord.הזמנה_id;
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing הזמנה_id' }), { status: 400 });
    }

    // Init Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Idempotency check
    const { data: existingInvoice } = await supabase
      .from('חשבוניות')
      .select('id, מספר_חשבונית')
      .eq('הזמנה_id', orderId)
      .maybeSingle();

    if (existingInvoice) {
      console.log('[create-morning-invoice] Invoice already exists for order', orderId, '— skipping');
      return new Response(JSON.stringify({ success: true, skipped: true, invoice_id: existingInvoice.id }), { status: 200 });
    }

    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .select(`
        id, מספר_הזמנה, לקוח_id, סך_הכל_לתשלום, סכום_לפני_הנחה, סכום_הנחה,
        סוג_הנחה, ערך_הנחה, אופן_תשלום, דמי_משלוח,
        לקוחות (שם_פרטי, שם_משפחה, אימייל, טלפון)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new Error(`Failed to fetch order ${orderId}: ${orderErr?.message}`);
    }

    // Fetch order items with product names and petit-four selections
    const { data: items, error: itemsErr } = await supabase
      .from('מוצרים_בהזמנה')
      .select(`
        id, סוג_שורה, גודל_מארז, כמות, מחיר_ליחידה, סהכ, הערות_לשורה,
        מוצרים_למכירה (שם_מוצר),
        בחירת_פטיפורים_בהזמנה (
          כמות,
          סוגי_פטיפורים (שם_פטיפור)
        )
      `)
      .eq('הזמנה_id', orderId);

    if (itemsErr) {
      throw new Error(`Failed to fetch order items: ${itemsErr.message}`);
    }

    // Env vars for Morning
    const morningApiId = Deno.env.get('MORNING_API_ID') ?? '';
    const morningApiSecret = Deno.env.get('MORNING_API_SECRET') ?? '';
    console.log('[create-morning-invoice] MORNING_API_ID exists:', !!morningApiId, '| length:', morningApiId.length, '| first4:', morningApiId.slice(0, 4));
    console.log('[create-morning-invoice] MORNING_API_SECRET exists:', !!morningApiSecret, '| length:', morningApiSecret.length, '| first4:', morningApiSecret.slice(0, 4));
    if (!morningApiId || !morningApiSecret) {
      throw new Error('MORNING_API_ID or MORNING_API_SECRET not set');
    }

    const token = await getMorningToken(morningApiId, morningApiSecret);

    // Build income lines
    const customer = order.לקוחות as { שם_פרטי: string; שם_משפחה: string; אימייל: string | null; טלפון: string | null };
    const incomeLines: object[] = [];

    for (const item of items ?? []) {
      let description = '';
      if (item.סוג_שורה === 'מארז' && item.גודל_מארז) {
        description = `מארז פטיפורים ${item.גודל_מארז} יחידות`;
        const selections = (item.בחירת_פטיפורים_בהזמנה as Array<{ כמות: number; סוגי_פטיפורים: { שם_פטיפור: string } }>) ?? [];
        if (selections.length > 0) {
          const selStr = selections.map((s) => `${s.סוגי_פטיפורים?.שם_פטיפור} ×${s.כמות}`).join(', ');
          description += ` (${selStr})`;
        }
      } else {
        description = (item.מוצרים_למכירה as { שם_מוצר: string } | null)?.שם_מוצר ?? 'פריט';
      }
      if (item.הערות_לשורה) description += ` — ${item.הערות_לשורה}`;

      incomeLines.push({
        description,
        quantity: item.כמות,
        price: item.מחיר_ליחידה,
        vatType: 1,
      });
    }

    // Delivery fee line
    if (order.דמי_משלוח && order.דמי_משלוח > 0) {
      incomeLines.push({
        description: 'דמי משלוח',
        quantity: 1,
        price: order.דמי_משלוח,
        vatType: 1,
      });
    }

    // Discount — add as negative income line (not discount field) so Morning's total always matches payment
    const incomeBeforeDiscount = (incomeLines as Array<{ price: number; quantity: number }>)
      .reduce((sum, l) => sum + l.price * l.quantity, 0);

    if (order.סוג_הנחה === 'אחוז' && order.ערך_הנחה && order.ערך_הנחה > 0) {
      const discountAmount = Math.round(incomeBeforeDiscount * order.ערך_הנחה / 100 * 100) / 100;
      incomeLines.push({ description: `הנחה ${order.ערך_הנחה}%`, quantity: 1, price: -discountAmount, vatType: 1 });
    } else if (order.סוג_הנחה === 'סכום' && order.ערך_הנחה && order.ערך_הנחה > 0) {
      incomeLines.push({ description: 'הנחה', quantity: 1, price: -order.ערך_הנחה, vatType: 1 });
    }

    // Payment = sum of all income lines (including discount line) — guaranteed to match Morning's total
    const paymentMethod = order.אופן_תשלום ?? '';
    const morningPaymentType = PAYMENT_TYPE_MAP[paymentMethod] ?? 4;

    const paymentAmount = Math.round(
      (incomeLines as Array<{ price: number; quantity: number }>)
        .reduce((sum, l) => sum + l.price * l.quantity, 0) * 100
    ) / 100;

    const dbTotal = order.סך_הכל_לתשלום ?? 0;
    const difference = Math.round(Math.abs(paymentAmount - dbTotal) * 100) / 100;

    console.log('[create-morning-invoice] Income before discount:', incomeBeforeDiscount);
    console.log('[create-morning-invoice] Discount type:', order.סוג_הנחה ?? 'none', '| value:', order.ערך_הנחה ?? 0);
    console.log('[create-morning-invoice] Payment amount (income lines sum):', paymentAmount);
    console.log('[create-morning-invoice] DB total (סך_הכל_לתשלום):', dbTotal);
    console.log('[create-morning-invoice] Difference:', difference);

    if (difference > 0.02) {
      console.warn('[create-morning-invoice] WARNING: payment differs from DB total by', difference, '— proceeding with income-lines total');
    }

    const documentBody: Record<string, unknown> = {
      description: `הזמנה ${order.מספר_הזמנה}`,
      type: 320,
      date: new Date().toISOString().slice(0, 10),
      lang: 'he',
      currency: 'ILS',
      vatType: 0,
      client: {
        name: `${customer.שם_פרטי} ${customer.שם_משפחה}`,
        ...(customer.אימייל ? { emails: [customer.אימייל] } : {}),
        ...(customer.טלפון ? { phone: customer.טלפון } : {}),
      },
      income: incomeLines,
      payment: [
        {
          type: morningPaymentType,
          price: paymentAmount,
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    };

    const documentsUrl = `${MORNING_API_BASE}/documents`;
    const tokenStr = String(token);
    console.log('[create-morning-invoice] Calling Morning API for order', order.מספר_הזמנה);
    console.log('[create-morning-invoice] Document payload:', JSON.stringify(documentBody));

    const docRes = await fetch(documentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenStr}`,
      },
      body: JSON.stringify(documentBody),
    });

    const docData = await docRes.json();
    console.log('[create-morning-invoice] Morning response status:', docRes.status);
    console.log('[create-morning-invoice] Morning response body:', JSON.stringify(docData));

    if (!docRes.ok) {
      throw new Error(`Morning documents API failed ${docRes.status}: ${JSON.stringify(docData)}`);
    }

    const invoiceNumber: string = docData.number ?? docData.id ?? String(docData.documentId ?? '');
    const invoiceUrl: string = docData.files?.downloadLinks?.he ?? docData.files?.downloadLinks?.origin ?? docData.url ?? docData.viewUrl ?? '';
    console.log('[create-morning-invoice] Invoice URL:', invoiceUrl || 'none');

    // Save to חשבוניות
    const { data: savedInvoice, error: saveErr } = await supabase
      .from('חשבוניות')
      .insert({
        הזמנה_id: orderId,
        לקוח_id: order.לקוח_id,
        מספר_חשבונית: invoiceNumber,
        קישור_חשבונית: invoiceUrl || null,
        סכום: totalAmount,
        סטטוס: 'הופקה',
      })
      .select('id')
      .single();

    if (saveErr) {
      throw new Error(`Failed to save invoice to DB: ${saveErr.message}`);
    }

    console.log('[create-morning-invoice] Invoice saved successfully:', savedInvoice?.id, 'number:', invoiceNumber);

    return new Response(
      JSON.stringify({ success: true, invoice_id: savedInvoice?.id, invoice_number: invoiceNumber }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[create-morning-invoice] ERROR:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
