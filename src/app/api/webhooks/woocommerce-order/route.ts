export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils';
import { sendOrderEmail, isInternalEmail, type OrderEmailData, type EmailContext } from '@/lib/email';

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

    console.log('[wc-webhook] START webhook processing');
    const wcOrderId = wc.id as number | undefined;
    console.log('[wc-webhook] order id:', wcOrderId, '| status:', wc.status);
    console.log('[wc-webhook] line_items:', JSON.stringify(wc.line_items ?? 'MISSING'));

    if (!wcOrderId) {
      console.log('[wc-webhook] STOP: no order ID in payload');
      return Response.json({ success: true });
    }

    const sourceKey = `WooCommerce:${wcOrderId}`;
    const supabase = createAdminClient();
    const warnings: string[] = [];

    // ── 1. Idempotency ──────────────────────────────────────────────────────
    console.log('[wc-webhook] checking duplicate for sourceKey:', sourceKey);
    const { data: existing, error: dupErr } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, מקור_ההזמנה')
      .eq('מקור_ההזמנה', sourceKey)
      .maybeSingle();

    console.log('[wc-webhook] duplicate check result:', existing ?? 'none', '| error:', dupErr?.message ?? 'none');

    if (existing) {
      console.log('[wc-webhook] STOP: duplicate found —', existing.מספר_הזמנה, '(id:', existing.id, ')');
      return Response.json({ success: true, skipped: true, order_id: existing.id });
    }

    // ── 2. Customer ─────────────────────────────────────────────────────────
    console.log('[wc-webhook] creating/updating customer...');
    const billing = (wc.billing ?? {}) as Record<string, string>;
    const phone = normalizePhone(billing.phone);
    const email = billing.email?.trim() || null;
    const firstName = billing.first_name || 'לא ידוע';
    const lastName = billing.last_name || null;
    console.log('[wc-webhook] billing — phone:', phone, '| email:', email, '| name:', firstName, lastName);

    let customerId: string;

    let existingCustomer: { id: string } | null = null;
    if (phone) {
      const { data, error: phErr } = await supabase.from('לקוחות').select('id').eq('טלפון', phone).maybeSingle();
      console.log('[wc-webhook] phone lookup result:', data ?? 'not found', phErr?.message ?? '');
      existingCustomer = data;
    }
    if (!existingCustomer && email) {
      const { data, error: emErr } = await supabase.from('לקוחות').select('id').eq('אימייל', email).maybeSingle();
      console.log('[wc-webhook] email lookup result:', data ?? 'not found', emErr?.message ?? '');
      existingCustomer = data;
    }

    if (existingCustomer) {
      customerId = existingCustomer.id;
      console.log('[wc-webhook] found existing customer:', customerId);
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
        console.error('[wc-webhook] STOP: customer creation failed:', custErr?.message);
        return Response.json({ success: true, error: 'customer creation failed' });
      }
      customerId = created.id;
      console.log('[wc-webhook] created new customer:', customerId);
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
    const paymentMethod =
      PAYMENT_METHOD_MAP[rawMethod] ??
      (wc.payment_method_title as string) ??
      (rawMethod || null);

    const shippingAddr = (wc.shipping ?? {}) as Record<string, string>;
    const deliveryAddress = shippingAddr.address_1 || billing.address_1 || null;
    const deliveryCity = shippingAddr.city || billing.city || null;

    // ── 4. Order ────────────────────────────────────────────────────────────
    console.log('[wc-webhook] creating order... total:', grandTotal, '| payment:', paymentStatus, '| sourceKey:', sourceKey);
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
    console.log('[wc-webhook] creating order lines... items count:', lineItems.length);
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
        הערות_לשורה: matchedId ? null : `${name} — מוצר לא נמצא במערכת`,
      });
      if (itemErr) {
        console.warn('[wc-webhook] item insert error:', itemErr.message, '| item:', name);
      } else {
        console.log(`[wc-webhook] Item saved: "${name}" | matched: ${!!matchedId} | qty: ${qty} | price: ${unitPrice}`);
      }
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

    // ── 7. Order confirmation email (non-blocking) ───────────────────────────
    void (async () => {
      try {
        const emailTo = email ?? null;
        const emailName = `${firstName} ${lastName ?? ''}`.trim();

        if (!emailTo) {
          console.log('[wc-webhook] Email skipped: no email address for customer');
          return;
        }
        if (isInternalEmail(emailTo)) {
          console.log('[wc-webhook] Email skipped: internal address —', emailTo);
          return;
        }

        // Fetch full order + items from DB (same pattern as create-full)
        const { data: fullOrder } = await supabase
          .from('הזמנות')
          .select('*, לקוחות(*)')
          .eq('id', order.id)
          .single();

        const { data: fullItems } = await supabase
          .from('מוצרים_בהזמנה')
          .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
          .eq('הזמנה_id', order.id);

        const o = (fullOrder ?? {}) as Record<string, unknown>;
        const emailOrderData: OrderEmailData = {
          orderNumber: (o['מספר_הזמנה'] as string) || '',
          orderDate: (o['תאריך_הזמנה'] as string) || new Date().toISOString().split('T')[0],
          deliveryDate: (o['תאריך_אספקה'] as string) || null,
          subtotal: Number(o['סכום_לפני_הנחה'] || 0),
          discount: Number(o['סכום_הנחה'] || 0),
          total: Number(o['סך_הכל_לתשלום'] || 0),
          customerPhone: phone,
          items: (fullItems || []).map((item: Record<string, unknown>) => {
            const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
            const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
            const pfNames = pfSelections
              ?.map(s => {
                const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
                return pf ? `${pf['שם_פטיפור']} ×${s['כמות']}` : '';
              })
              .filter(Boolean)
              .join(', ');
            const name =
              item['סוג_שורה'] === 'מארז'
                ? `מארז ${item['גודל_מארז'] || ''} יח׳${pfNames ? ` (${pfNames})` : ''}`
                : (prod?.['שם_מוצר'] as string) || (item['הערות_לשורה'] as string) || 'פריט';
            return {
              name,
              quantity: Number(item['כמות'] || 1),
              unitPrice: Number(item['מחיר_ליחידה'] || 0),
              lineTotal: Number(item['סהכ'] || 0),
            };
          }),
        };

        const emailContext: EmailContext = { customerId, orderId: order.id };

        console.log('[wc-webhook] Sending order confirmation email to', emailTo);
        await sendOrderEmail(emailTo, emailName, emailOrderData, emailContext);
        console.log('[wc-webhook] Order confirmation email queued/sent');
      } catch (err) {
        console.error('[wc-webhook] Order confirmation email failed:', err instanceof Error ? err.message : err);
      }
    })();

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
