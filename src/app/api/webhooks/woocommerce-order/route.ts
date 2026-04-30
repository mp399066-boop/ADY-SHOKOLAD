export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils';

const PAID_STATUSES = new Set(['processing', 'completed']);

const PAYMENT_METHOD_MAP: Record<string, string> = {
  stripe: 'כרטיס אשראי',
  credit_card: 'כרטיס אשראי',
  paypal: 'PayPal',
  bacs: 'העברה בנקאית',
  cheque: 'המחאה',
  cod: 'מזומן',
};

function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-().+]/g, '').trim();
  return cleaned || null;
}

export async function GET() {
  return Response.json({ ok: true, route: 'woocommerce-order' });
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    console.log('[wc-webhook] RAW BODY (first 1000):', text.slice(0, 1000));

    let wc: Record<string, unknown> = {};
    try {
      wc = JSON.parse(text);
    } catch {
      console.log('[wc-webhook] Invalid JSON — returning 200 to WooCommerce');
      return Response.json({ success: true });
    }

    const wcOrderId = wc.id as number | undefined;
    console.log('[wc-webhook] Order ID:', wcOrderId, '| Status:', wc.status);
    console.log('[wc-webhook] line_items:', JSON.stringify(wc.line_items ?? 'MISSING'));

    if (!wcOrderId) {
      console.log('[wc-webhook] No order ID — skipping');
      return Response.json({ success: true });
    }

    const sourceKey = `WooCommerce:${wcOrderId}`;
    const supabase = createAdminClient();
    const warnings: string[] = [];

    // ── 1. Idempotency ──────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה')
      .eq('מקור_ההזמנה', sourceKey)
      .maybeSingle();

    if (existing) {
      console.log(`[wc-webhook] Already imported as ${existing.מספר_הזמנה} — skipping`);
      return Response.json({ success: true, skipped: true, order_id: existing.id });
    }

    // ── 2. Customer ─────────────────────────────────────────────────────────
    const billing = (wc.billing ?? {}) as Record<string, string>;
    const phone = normalizePhone(billing.phone);
    const email = billing.email?.trim() || null;
    const firstName = billing.first_name || 'לא ידוע';
    const lastName = billing.last_name || null;

    let customerId: string;

    let existingCustomer: { id: string } | null = null;
    if (phone) {
      const { data } = await supabase.from('לקוחות').select('id').eq('טלפון', phone).maybeSingle();
      existingCustomer = data;
    }
    if (!existingCustomer && email) {
      const { data } = await supabase.from('לקוחות').select('id').eq('אימייל', email).maybeSingle();
      existingCustomer = data;
    }

    if (existingCustomer) {
      customerId = existingCustomer.id;
      console.log('[wc-webhook] Found customer:', customerId);
    } else {
      const { data: created, error: custErr } = await supabase
        .from('לקוחות')
        .insert({
          שם_פרטי: firstName,
          שם_משפחה: lastName,
          טלפון: phone,
          אימייל: email,
          סוג_לקוח: 'פרטי',
          מקור_הגעה: 'WooCommerce',
        })
        .select('id')
        .single();

      if (custErr || !created) {
        console.error('[wc-webhook] Failed to create customer:', custErr?.message);
        return Response.json({ success: true, error: 'customer creation failed' });
      }
      customerId = created.id;
      console.log('[wc-webhook] Created customer:', customerId);
    }

    // ── 3. Totals ───────────────────────────────────────────────────────────
    const lineItems = (wc.line_items ?? []) as Array<Record<string, unknown>>;
    const shippingFee = parseFloat((wc.shipping_total as string) ?? '0') || 0;
    const discountTotal = parseFloat((wc.discount_total as string) ?? '0') || 0;
    const grandTotal = parseFloat((wc.total as string) ?? '0') || 0;
    const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.subtotal as string) || 0), 0) + shippingFee;
    const isPaid = PAID_STATUSES.has((wc.status as string) ?? '');
    const paymentStatus: 'שולם' | 'ממתין' = isPaid ? 'שולם' : 'ממתין';
    const rawMethod = (wc.payment_method as string) ?? '';
    const paymentMethod = PAYMENT_METHOD_MAP[rawMethod] ?? (wc.payment_method_title as string) ?? rawMethod || null;

    const shippingAddr = (wc.shipping ?? {}) as Record<string, string>;
    const deliveryAddress = shippingAddr.address_1 || billing.address_1 || null;
    const deliveryCity = shippingAddr.city || billing.city || null;

    // ── 4. Order ────────────────────────────────────────────────────────────
    const dateCreated = wc.date_created
      ? (wc.date_created as string).split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { data: order, error: orderErr } = await supabase
      .from('הזמנות')
      .insert({
        מספר_הזמנה: generateOrderNumber(),
        לקוח_id: customerId,
        סטטוס_הזמנה: 'חדשה',
        הזמנה_דחופה: false,
        תאריך_הזמנה: dateCreated,
        תאריך_אספקה: null,
        שעת_אספקה: null,
        סוג_אספקה: deliveryAddress ? 'משלוח' : 'איסוף עצמי',
        שם_מקבל: `${firstName} ${lastName ?? ''}`.trim() || null,
        טלפון_מקבל: phone,
        כתובת_מקבל_ההזמנה: deliveryAddress,
        עיר: deliveryCity,
        הוראות_משלוח: (wc.customer_note as string) || null,
        דמי_משלוח: shippingFee,
        אופן_תשלום: paymentMethod,
        סטטוס_תשלום: paymentStatus,
        סוג_הנחה: discountTotal > 0 ? 'סכום' : 'ללא',
        ערך_הנחה: discountTotal > 0 ? discountTotal : null,
        סכום_לפני_הנחה: subtotal,
        סכום_הנחה: discountTotal,
        סך_הכל_לתשלום: grandTotal,
        מקור_ההזמנה: sourceKey,
        הערות_להזמנה: `הזמנה מאתר WooCommerce #${wc.number ?? wcOrderId}`,
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      console.error('[wc-webhook] Failed to create order:', orderErr?.message);
      return Response.json({ success: true, error: 'order creation failed' });
    }
    console.log('[wc-webhook] Created order:', order.id);

    // ── 5. Match products & create line items ────────────────────────────────
    const { data: catalog } = await supabase.from('מוצרים_למכירה').select('id, שם_מוצר').eq('פעיל', true);
    const productByName = new Map<string, string>();
    for (const p of catalog ?? []) {
      productByName.set((p.שם_מוצר as string).toLowerCase().trim(), p.id as string);
    }

    for (const item of lineItems) {
      const name = (item.name as string) ?? '';
      const sku = (item.sku as string) ?? '';
      const qty = (item.quantity as number) || 1;
      const unitPrice = parseFloat(item.price as string) || 0;
      const lineTotal = parseFloat(item.subtotal as string) || unitPrice * qty;

      const matchedId =
        productByName.get(name.toLowerCase().trim()) ??
        (sku ? productByName.get(sku.toLowerCase().trim()) : undefined) ??
        null;

      if (!matchedId) {
        const w = `מוצר לא נמצא: "${name}" (SKU: ${sku || '-'})`;
        warnings.push(w);
        console.warn('[wc-webhook]', w);
      }

      const { error: itemErr } = await supabase.from('מוצרים_בהזמנה').insert({
        הזמנה_id: order.id,
        מוצר_id: matchedId,
        סוג_שורה: 'מוצר',
        כמות: qty,
        מחיר_ליחידה: unitPrice,
        סהכ: lineTotal,
        הערות_לשורה: matchedId ? null : name,
      });
      if (itemErr) console.warn('[wc-webhook] item insert error:', itemErr.message);
    }

    // ── 6. Payment record (triggers Morning invoice if paid) ─────────────────
    const { error: payErr } = await supabase.from('תשלומים').insert({
      הזמנה_id: order.id,
      סכום: grandTotal,
      אמצעי_תשלום: paymentMethod ?? 'כרטיס אשראי',
      סטטוס_תשלום: paymentStatus,
      תאריך_תשלום: new Date().toISOString().split('T')[0],
      הערות: `WooCommerce #${wc.number ?? wcOrderId}`,
    });

    if (payErr) {
      console.warn('[wc-webhook] payment insert error:', payErr.message);
    } else {
      console.log(`[wc-webhook] Payment saved — status: ${paymentStatus}${isPaid ? ' → Morning invoice will trigger' : ''}`);
    }

    return Response.json({
      success: true,
      order_id: order.id,
      customer_id: customerId,
      payment_status: paymentStatus,
      warnings,
    });

  } catch (error) {
    console.error('[wc-webhook] Unexpected error:', error);
    return Response.json({ success: true });
  }
}
