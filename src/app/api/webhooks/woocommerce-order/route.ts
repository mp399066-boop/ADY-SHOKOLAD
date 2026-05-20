export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils';
import {
  sendOrderEmail,
  isInternalEmail,
  buildItemName,
  extractPetitFours,
  buildItemsSnapshot,
  type OrderEmailData,
  type EmailContext,
} from '@/lib/email';
import { sendAdminNewOrderAlert } from '@/lib/admin-alert-email';
import { deductOrderInventory, restoreOrderInventory } from '@/lib/inventory-deduct';
import { isServiceEnabled, logServiceRun } from '@/lib/system-services';
import { logActivity, WEBHOOK_ACTOR_WC } from '@/lib/activity-log';

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

// Lightweight name normaliser used for catalog matching. Keeps Hebrew letters
// + digits, collapses whitespace, lowercases Latin chars. Two products that
// differ only by trailing whitespace / extra space match the same key.
function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Build a stable identity slug for a WC line item — the same product/variation
// hitting two different orders ALWAYS resolves to the same slug, so the
// dedup-on-insert guard reliably catches it. Order of preference:
//   1. SKU (operator-controlled, most reliable)
//   2. variation_id (only set on variable products) — combined with product_id
//   3. product_id alone
//   4. normalized name — last resort, only when WC sent neither id nor sku
function buildWcSlug(item: Record<string, unknown>): string {
  const sku = (item.sku as string | undefined)?.trim();
  if (sku) {
    return `wc-sku-${sku.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '').slice(0, 80)}` || `wc-sku-${Date.now()}`;
  }
  const productId = item.product_id as number | undefined;
  const variationId = item.variation_id as number | undefined;
  if (productId && variationId) return `wc-prod-${productId}-var-${variationId}`;
  if (productId)               return `wc-prod-${productId}`;
  if (variationId)             return `wc-var-${variationId}`;
  const name = (item.name as string | undefined) ?? '';
  if (name) {
    // Hash via simple base36 fold so RTL Hebrew names produce stable slugs.
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
    return `wc-name-${(h >>> 0).toString(36)}`;
  }
  return `wc-fallback-${Date.now()}`;
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

    // Verbose top-of-handler dump — the user needs this to confirm the
    // payment-success webhook actually arrives and carries the meta we
    // need. Includes every field used in routing decisions; nothing
    // sensitive.
    type WcMeta = { key?: string; value?: unknown };
    const wcMetaDump = (wc.meta_data ?? []) as WcMeta[];
    const crmOrderIdFromMeta    = (wcMetaDump.find(m => m.key === 'crm_order_id')?.value     ?? null) as string | null;
    const crmPaymentOnlyFromMeta = (wcMetaDump.find(m => m.key === 'crm_payment_only')?.value ?? null) as string | null;
    const crmOrderNumberFromMeta = (wcMetaDump.find(m => m.key === 'crm_order_number')?.value ?? null) as string | null;
    const crmTotalChargedFromMeta = (wcMetaDump.find(m => m.key === 'crm_total_charged')?.value ?? null) as string | null;

    console.log('[wc-webhook] ── EVENT DUMP ─────────────────────────────');
    console.log('[wc-webhook]   wc_order_id      :', wcOrderId);
    console.log('[wc-webhook]   wc_status        :', wc.status);
    console.log('[wc-webhook]   payment_method   :', wc.payment_method);
    console.log('[wc-webhook]   payment_method_t :', wc.payment_method_title);
    console.log('[wc-webhook]   date_paid        :', wc.date_paid ?? wc.date_paid_gmt ?? null);
    console.log('[wc-webhook]   transaction_id   :', wc.transaction_id);
    console.log('[wc-webhook]   total            :', wc.total);
    console.log('[wc-webhook]   meta_data keys   :', wcMetaDump.map(m => m.key).join(', ') || '(none)');
    console.log('[wc-webhook]   crm_order_id     :', crmOrderIdFromMeta);
    console.log('[wc-webhook]   crm_payment_only :', crmPaymentOnlyFromMeta);
    console.log('[wc-webhook]   crm_order_number :', crmOrderNumberFromMeta);
    console.log('[wc-webhook]   crm_total_charged:', crmTotalChargedFromMeta);
    console.log('[wc-webhook] ───────────────────────────────────────────');
    console.log('[wc-webhook] line_items:', JSON.stringify(wc.line_items ?? 'MISSING'));

    // Control-center kill-switch. We still 200-OK to WooCommerce so it
    // doesn't retry the webhook indefinitely; we just don't create the order.
    // The skipped run is logged so the admin page surfaces what was dropped.
    {
      const supabaseGate = createAdminClient();
      if (!(await isServiceEnabled(supabaseGate, 'woocommerce_orders'))) {
        console.log('[wc-webhook] service "woocommerce_orders" is OFF in control center — skipping order creation');
        await logServiceRun(supabaseGate, {
          serviceKey:  'woocommerce_orders',
          action:      'create_order_from_wc',
          status:      'disabled',
          relatedType: 'wc_order',
          relatedId:   String(wcOrderId ?? ''),
          message:     `WC order #${wcOrderId ?? '?'} ignored — service disabled`,
          metadata:    { wc_status: wc.status ?? null },
        });
        return Response.json({ success: true, skipped: true, reason: 'service_disabled' });
      }
    }

    if (!wcOrderId) {
      console.log('[wc-webhook] STOP: no order ID in payload');
      return Response.json({ success: true });
    }

    const sourceKey = `WooCommerce:${wcOrderId}`;
    const supabase = createAdminClient();
    const warnings: string[] = [];

    // ── 1a. Is this our own CRM-originated WC mirror? ───────────────────────
    // /api/orders/[id]/create-payment-link attaches meta_data.crm_order_id
    // to every WC order it creates. When PayPlus completes and WC fires
    // the webhook back, we MUST recognize the event as "payment update
    // for an existing CRM order" — not as a new website order — or we
    // duplicate the row in הזמנות.
    if (crmOrderIdFromMeta) {
      console.log('[wc-webhook] SOURCE = CRM payment callback | crm_order_id:', crmOrderIdFromMeta, '| wc_order_id:', wcOrderId, '| wc_status:', wc.status);

      const { data: crmOrder, error: crmErr } = await supabase
        .from('הזמנות')
        .select('id, מספר_הזמנה, סטטוס_תשלום, סוג_הזמנה')
        .eq('id', crmOrderIdFromMeta)
        .maybeSingle();

      console.log('[wc-webhook]   crm_order lookup — found:', Boolean(crmOrder), '| current סטטוס_תשלום:', crmOrder?.סטטוס_תשלום ?? '(n/a)', '| err:', crmErr?.message ?? 'none');

      if (crmErr || !crmOrder) {
        console.error('[wc-webhook] CRM order from meta not found — refusing to create duplicate. crm_order_id:', crmOrderIdFromMeta);
        return Response.json({
          ok: false,
          source: 'CRM_payment_callback',
          wc_order_id: wcOrderId,
          wc_status: wc.status,
          crm_order_id: crmOrderIdFromMeta,
          was_paid_before: null,
          updated_order_paid: false,
          updated_payment_row: false,
          reason_if_not_updated: 'crm_order_not_found',
        });
      }

      const isPaidNow  = PAID_STATUSES.has((wc.status as string) ?? '');
      const wasPaid    = crmOrder.סטטוס_תשלום === 'שולם';
      const grandTotal = parseFloat((wc.total as string) ?? '0') || 0;

      console.log('[wc-webhook]   isPaidNow:', isPaidNow, '(PAID_STATUSES =', Array.from(PAID_STATUSES).join('/'), ') | wasPaid:', wasPaid);

      // Idempotent: if already paid, acknowledge and skip the writes.
      if (wasPaid) {
        console.log('[wc-webhook] CRM order already שולם — no-op. crm_order_id:', crmOrderIdFromMeta);
        return Response.json({
          ok: true,
          source: 'CRM_payment_callback',
          wc_order_id: wcOrderId,
          wc_status: wc.status,
          crm_order_id: crmOrderIdFromMeta,
          was_paid_before: true,
          updated_order_paid: false,
          updated_payment_row: false,
          reason_if_not_updated: 'already_paid',
        });
      }

      if (!isPaidNow) {
        console.log('[wc-webhook] CRM order callback with non-paid status — no DB write. wc_status:', wc.status);
        return Response.json({
          ok: true,
          source: 'CRM_payment_callback',
          wc_order_id: wcOrderId,
          wc_status: wc.status,
          crm_order_id: crmOrderIdFromMeta,
          was_paid_before: false,
          updated_order_paid: false,
          updated_payment_row: false,
          reason_if_not_updated: `wc_status_not_in_PAID_SET (${wc.status})`,
        });
      }

      // ── Paid path ──────────────────────────────────────────────────────
      const { error: updErr } = await supabase
        .from('הזמנות')
        .update({ סטטוס_תשלום: 'שולם', תאריך_עדכון: new Date().toISOString() })
        .eq('id', crmOrderIdFromMeta);

      if (updErr) {
        console.error('[wc-webhook] CRM order paid-flip FAILED:', updErr.message);
        return Response.json({
          ok: false,
          source: 'CRM_payment_callback',
          wc_order_id: wcOrderId,
          wc_status: wc.status,
          crm_order_id: crmOrderIdFromMeta,
          was_paid_before: false,
          updated_order_paid: false,
          updated_payment_row: false,
          reason_if_not_updated: `db_update_failed: ${updErr.message}`,
        });
      }
      console.log('[wc-webhook]   ✓ הזמנות.סטטוס_תשלום updated to שולם. crm_order_id:', crmOrderIdFromMeta);

      const wcTxnId = (wc.transaction_id as string | undefined) || '';
      const { data: payRow, error: payRowErr } = await supabase
        .from('תשלומים')
        .update({
          סטטוס_תשלום: 'שולם',
          תאריך_תשלום: new Date().toISOString(),
          הערות:        `wc_order_id:${wcOrderId}${wcTxnId ? ` · txn:${wcTxnId}` : ''} · paid via WC webhook`,
        })
        .eq('הזמנה_id', crmOrderIdFromMeta)
        .eq('אמצעי_תשלום', 'WooCommerce')
        .eq('סטטוס_תשלום', 'ממתין')
        .select('id');
      const updatedPaymentRow = !payRowErr && Array.isArray(payRow) && payRow.length > 0;
      if (payRowErr) console.warn('[wc-webhook]   תשלומים row update failed (continuing):', payRowErr.message);
      else console.log('[wc-webhook]   תשלומים rows updated:', payRow?.length ?? 0);

      // Inventory is intentionally not touched here. This branch is only a
      // payment callback for an existing CRM order; stock is deducted when
      // the order first becomes real (create-full / finalize-draft / WC
      // website import), and the ledger keeps those hooks idempotent.

      void logActivity({
        actor:       WEBHOOK_ACTOR_WC,
        module:      'finance',
        action:      'crm_order_paid_via_woocommerce',
        status:      'success',
        entityType:  'order',
        entityId:    crmOrderIdFromMeta,
        entityLabel: crmOrder.מספר_הזמנה || `WC #${wcOrderId}`,
        title:       'הזמנה שולמה דרך WooCommerce/PayPlus',
        description: `WC #${wcOrderId} השלים תשלום — סטטוס_תשלום עודכן ל"שולם".`,
        metadata:    { wc_order_id: wcOrderId, wc_total: grandTotal, wc_transaction_id: wcTxnId || null, source: 'wc_webhook_crm_callback' },
        request:     req,
      });

      console.log('[wc-webhook] DONE — CRM order paid. crm_order_id:', crmOrderIdFromMeta, '| wc_order_id:', wcOrderId, '| total:', grandTotal);
      return Response.json({
        ok: true,
        source: 'CRM_payment_callback',
        wc_order_id: wcOrderId,
        wc_status: wc.status,
        crm_order_id: crmOrderIdFromMeta,
        was_paid_before: false,
        updated_order_paid: true,
        updated_payment_row: updatedPaymentRow,
        reason_if_not_updated: null,
      });
    }

    console.log('[wc-webhook] SOURCE = website (no crm_order_id in meta_data) | wc_order_id:', wcOrderId);

    // ── 1b. Idempotency for true website orders ─────────────────────────────
    console.log('[wc-webhook] checking duplicate for sourceKey:', sourceKey);
    const { data: existing, error: dupErr } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, מקור_ההזמנה')
      .eq('מקור_ההזמנה', sourceKey)
      .maybeSingle();

    console.log('[wc-webhook] duplicate check result:', existing ?? 'none', '| error:', dupErr?.message ?? 'none');

    if (existing) {
      // If the WC order was cancelled, mirror the cancellation in the CRM
      // and restore inventory. Idempotent: if order is already בוטלה the
      // restore is a no-op (net-ledger guard).
      if ((wc.status as string) === 'cancelled') {
        console.log('[wc-webhook] WC order cancelled — cancelling CRM order and restoring inventory. order:', existing.id);
        const { error: cancelErr } = await supabase
          .from('הזמנות')
          .update({ סטטוס_הזמנה: 'בוטלה', תאריך_עדכון: new Date().toISOString() })
          .eq('id', existing.id)
          .neq('סטטוס_הזמנה', 'בוטלה');
        if (cancelErr) console.error('[wc-webhook] cancellation update failed:', cancelErr.message);
        await restoreOrderInventory(supabase, existing.id);
        console.log('[wc-webhook] DONE — WC cancellation handled. order:', existing.id);
        return Response.json({ success: true, cancelled: true, order_id: existing.id });
      }
      console.log('[wc-webhook] STOP: duplicate found —', existing.מספר_הזמנה, '(id:', existing.id, ')');
      return Response.json({ success: true, skipped: true, order_id: existing.id });
    }

    // Skip creating an order for a WC cancellation we haven't seen yet.
    if ((wc.status as string) === 'cancelled') {
      console.log('[wc-webhook] WC order cancelled but no CRM order found — nothing to do. wc_order_id:', wcOrderId);
      return Response.json({ success: true, skipped: true, reason: 'cancelled_no_crm_order' });
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
    // Catalog query intentionally does NOT filter by פעיל — an inactive
    // product in the catalog should still be matched (re-using its id) rather
    // than silently re-created as a duplicate.
    console.log('[wc-webhook] creating order lines... items count:', lineItems.length);
    const { data: catalog, error: catalogErr } = await supabase
      .from('מוצרים_למכירה')
      .select('id, שם_מוצר, sku');
    if (catalogErr) console.error('[wc-webhook] catalog query failed:', catalogErr.message);
    const productBySku  = new Map<string, string>(); // WC sku → CRM id
    const productByName = new Map<string, string>(); // normalized name → CRM id
    for (const p of catalog ?? []) {
      const pSku = (p.sku as string | null);
      const pName = (p.שם_מוצר as string | null);
      if (pSku)  productBySku.set(pSku.toLowerCase().trim(), p.id as string);
      if (pName) productByName.set(normalizeName(pName), p.id as string);
    }

    // Track products created during this webhook so the admin alert email
    // can list them. Same wcSlug seen twice in a single webhook resolves to
    // the same id (we update the maps in-place after each insert).
    const newProducts: { id: string; name: string }[] = [];

    for (const item of lineItems) {
      const rawName = (item.name as string) ?? '';
      const name = rawName.trim() || `מוצר WooCommerce #${(item.product_id as number | undefined) ?? wcOrderId}`;
      const sku = (item.sku as string | undefined)?.trim() ?? '';
      const qty = (item.quantity as number) || 1;
      const unitPrice = parseFloat(item.price as string) || 0;
      const lineTotal = parseFloat(item.subtotal as string) || unitPrice * qty;
      const wooProductId = item.product_id as number | undefined;
      const wooVariationId = item.variation_id as number | undefined;
      const wcSlug = buildWcSlug(item);

      // Match priority: WC SKU (exact, case-insensitive) → normalized name.
      let matchedId: string | null =
        (sku ? productBySku.get(sku.toLowerCase()) : undefined) ??
        productByName.get(normalizeName(name)) ??
        null;

      if (matchedId) {
        console.log('[woocommerce] matched product',
          '| woo order id:', wcOrderId,
          '| woo product id:', wooProductId ?? '—',
          '| sku:', sku || '—',
          '| name:', name,
          '| local product id:', matchedId);
      } else {
        // No match → create. Stock starts at 0 (do not invent stock).
        // תיאור carries WC provenance so the operator can complete the product.
        const desc = `נוצר אוטומטית מהאתר — להשלים מלאי/קטגוריה`
          + ` · WooCommerce #${wcOrderId}`
          + (wooProductId ? ` · WC product #${wooProductId}` : '')
          + (wooVariationId ? ` · variation #${wooVariationId}` : '')
          + (sku ? ` · SKU ${sku}` : '');

        const { data: newProduct, error: createErr } = await supabase
          .from('מוצרים_למכירה')
          .insert({
            שם_מוצר:                  name,
            מחיר:                     unitPrice,
            sku:                      sku || null,
            סוג_מוצר:                 'מוצר רגיל',
            פעיל:                     true,
            תיאור:                    desc,
            כמות_במלאי:               0,
            סף_מלאי_נמוך:             0,
            סף_מלאי_קריטי:            0,
            סטטוס_מלאי:               'אזל מהמלאי',
            האם_צריך_בחירת_פטיפורים:  false,
            לקוחות_עסקיים_בלבד:       false,
            price_availability:        'retail',
            קטגוריית_מוצר:             'אחר',
          })
          .select('id')
          .single();

        if (newProduct) {
          matchedId = newProduct.id as string;
          newProducts.push({ id: matchedId, name });
          if (sku) productBySku.set(sku.toLowerCase(), matchedId);
          productByName.set(normalizeName(name), matchedId);
          console.log('[woocommerce] created missing product',
            '| woo order id:', wcOrderId,
            '| woo product id:', wooProductId ?? '—',
            '| sku:', sku || '—',
            '| name:', name,
            '| price:', unitPrice,
            '| new local product id:', matchedId);
        } else {
          // Insert failed — recover by SKU (unique constraint race), then name.
          const { data: bySku }  = sku
            ? await supabase.from('מוצרים_למכירה').select('id').eq('sku', sku).maybeSingle()
            : { data: null };
          const { data: byName } = !bySku
            ? await supabase.from('מוצרים_למכירה').select('id').eq('שם_מוצר', name).maybeSingle()
            : { data: null };

          const recovered = bySku ?? byName;
          if (recovered) {
            matchedId = recovered.id as string;
            if (sku) productBySku.set(sku.toLowerCase(), matchedId);
            productByName.set(normalizeName(name), matchedId);
            console.log('[woocommerce] recovered product after insert conflict',
              '| via:', bySku ? 'sku' : 'name',
              '| sku:', sku || '—', '| name:', name, '| id:', matchedId);
          } else {
            console.error('[woocommerce] FAILED to create or find product — מוצר_id will be NULL',
              '| woo order id:', wcOrderId,
              '| woo product id:', wooProductId ?? '—',
              '| sku:', sku || '—',
              '| slug:', wcSlug,
              '| name:', name,
              '| insert error:', createErr?.message ?? 'unknown');
            warnings.push(`מוצר מהאתר לא שויך — דורש טיפול: "${name}"${sku ? ` (SKU ${sku})` : ''}`);
          }
        }
      }

      // Insert order item. matchedId may still be null if BOTH create and
      // recovery failed — in that case the line is recorded with the WC
      // name in הערות so the operator can see what was ordered even though
      // we couldn't bind it to a catalog product.
      const { error: itemErr } = await supabase.from('מוצרים_בהזמנה').insert({
        הזמנה_id:     order.id,
        מוצר_id:      matchedId,
        סוג_שורה:     'מוצר',
        כמות:         qty,
        מחיר_ליחידה:  unitPrice,
        סהכ:          lineTotal,
        הערות_לשורה:  matchedId ? null : `מוצר מהאתר: ${name}${sku ? ` (SKU ${sku})` : ''}`,
      });
      if (itemErr) {
        console.warn('[wc-webhook] item insert error:', itemErr.message, '| item:', name);
      } else {
        console.log(`[wc-webhook] Item saved: "${name}" | matched: ${!!matchedId} | qty: ${qty} | price: ${unitPrice}`);
      }
    }

    // If any product could not be linked, log a dedicated warning activity so
    // operators see it immediately in the activity feed.
    if (warnings.length > 0) {
      void logActivity({
        actor:       WEBHOOK_ACTOR_WC,
        module:      'integrations',
        action:      'woocommerce_product_unlinked',
        status:      'warning',
        entityType:  'order',
        entityId:    order.id,
        entityLabel: `WC #${wcOrderId ?? '?'}`,
        title:       'מוצר מהאתר לא שויך — דורש טיפול',
        description: warnings.join('\n'),
        metadata:    { wc_order_id: wcOrderId, warnings },
        serviceKey:  'woocommerce_orders',
        request:     req,
      });
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
          .eq('הזמנה_id', order.id)
          .order('סדר_תצוגה', { ascending: true });

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
            const prod         = item['מוצרים_למכירה']          as Record<string, unknown> | null;
            const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
            const petitFours   = extractPetitFours(pfSelections);
            const isPackage    = item['סוג_שורה'] === 'מארז';
            return {
              name:      buildItemName(item, prod),
              quantity:  Number(item['כמות']        || 1),
              unitPrice: Number(item['מחיר_ליחידה'] || 0),
              lineTotal: Number(item['סהכ']          || 0),
              ...(isPackage && petitFours.length > 0 ? { petitFours } : {}),
            };
          }),
        };

        const emailContext: EmailContext = { customerId, orderId: order.id };

        console.log('[wc-webhook] Sending order confirmation email to', emailTo);
        await sendOrderEmail(emailTo, emailName, emailOrderData, emailContext);
        console.log('[wc-webhook] Order confirmation email queued/sent');

        // Persist items snapshot + sent_at + sent_total so the FIRST
        // operator-triggered "send updated summary" can diff against what
        // the customer actually received in this confirmation. Failure to
        // write the snapshot column falls back to the legacy two columns.
        try {
          const snapshot  = buildItemsSnapshot((fullItems || []) as Record<string, unknown>[]);
          const sentTotal = (o['סך_הכל_לתשלום'] as number | string | undefined) ?? 0;
          const { error: snapErr } = await supabase
            .from('הזמנות')
            .update({
              summary_email_sent_at:             new Date().toISOString(),
              summary_email_sent_total:          sentTotal,
              summary_email_sent_items_snapshot: snapshot,
            })
            .eq('id', order.id);
          if (snapErr) {
            console.error('[wc-webhook] snapshot write failed, retrying without snapshot column:', snapErr.message);
            await supabase
              .from('הזמנות')
              .update({
                summary_email_sent_at:    new Date().toISOString(),
                summary_email_sent_total: sentTotal,
              })
              .eq('id', order.id);
          }
        } catch (snapErr) {
          console.error('[wc-webhook] snapshot persist failed:', snapErr);
        }
      } catch (err) {
        console.error('[wc-webhook] Order confirmation email failed:', err instanceof Error ? err.message : err);
      }
    })();

    // Inventory deduction on website order import. New policy (May 2026):
    // a real order consumes stock immediately, regardless of payment
    // status. The webhook imports the order as 'חדשה' (not draft), so
    // deduction fires for every imported order. Idempotent via the
    // net-ledger guard — replays / retries are no-ops.
    console.log('[inventory] WC order imported — running deductOrderInventory. order:', order.id);
    await deductOrderInventory(supabase, order.id);

    // Owner-facing internal alert. Same template create-full uses; the
    // `source` + `newProducts` options drive the WC-specific banner and the
    // "נוסף מוצר חדש למוצרים למכירה" callout in the email body.
    void sendAdminNewOrderAlert(order.id, {
      source: 'WooCommerce',
      sourceOrderNumber: wcOrderId,
      newProducts,
    });

    void logActivity({
      actor:       WEBHOOK_ACTOR_WC,
      module:      'integrations',
      action:      'woocommerce_order_created',
      status:      'success',
      entityType:  'order',
      entityId:    order.id,
      entityLabel: `WC #${wcOrderId ?? '?'}`,
      title:       'התקבלה הזמנה מ-WooCommerce',
      description: `סטטוס תשלום: ${paymentStatus}${newProducts.length ? ` · נוצרו ${newProducts.length} מוצרים חדשים` : ''}`,
      metadata:    { wc_order_id: wcOrderId, payment_status: paymentStatus, new_products: newProducts.length, warnings: warnings.length },
      serviceKey:  'woocommerce_orders',
      request:     req,
    });

    return Response.json({
      success: true,
      order_id: order.id,
      customer_id: customerId,
      payment_status: paymentStatus,
      new_products: newProducts.length,
      warnings,
    });

  } catch (error) {
    console.error('[wc-webhook] Unexpected error:', error);
    void logActivity({
      actor:        WEBHOOK_ACTOR_WC,
      module:       'integrations',
      action:       'woocommerce_order_failed',
      status:       'failed',
      title:        'עיבוד webhook של WooCommerce נכשל',
      errorMessage: error instanceof Error ? error.message : String(error),
      serviceKey:   'woocommerce_orders',
      request:      req,
    });
    return Response.json({ success: true });
  }
}
