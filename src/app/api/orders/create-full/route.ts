export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { generateOrderNumber } from '@/lib/utils';
import { sendOrderEmail, isInternalEmail, type OrderEmailData, type EmailContext } from '@/lib/email';
import { logActivity, userActor } from '@/lib/activity-log';
import { deductOrderInventory } from '@/lib/inventory-deduct';

// In-memory idempotency store — maps clientRequestId → { orderId, response, expiresAt }
// Prevents duplicate orders when the client sends the same request more than once.
const idempotencyCache = new Map<string, { orderId: string; responseBody: unknown; expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 60_000; // 60 seconds

function pruneExpired() {
  const now = Date.now();
  idempotencyCache.forEach((entry, key) => {
    if (entry.expiresAt < now) idempotencyCache.delete(key);
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const body = await req.json();
  const { clientRequestId } = body;

  console.log('[create-full] POST received', {
    time: new Date().toISOString(),
    user: auth.email,
    clientRequestId: clientRequestId || 'NONE',
    customer: body.לקוח?.id || body.לקוח?.שם_פרטי,
    deliveryDate: body.הזמנה?.תאריך_אספקה,
    itemCount: (body.מוצרים || []).length + (body.מארזי_פטיפורים || []).length,
    cacheSize: idempotencyCache.size,
  });

  // Check idempotency cache before doing any work
  if (clientRequestId) {
    pruneExpired();
    const cached = idempotencyCache.get(clientRequestId);
    if (cached) {
      console.log('[create-full] DUPLICATE REQUEST detected — returning cached result for', clientRequestId);
      return NextResponse.json({ ...cached.responseBody as object, deduplicated: true }, { status: 201 });
    }
  }

  const supabase = createAdminClient();

  const {
    לקוח,
    הזמנה,
    משלוח,
    תשלום,
    מוצרים = [],
    מארזי_פטיפורים = [],
  } = body;

  if (!לקוח) return NextResponse.json({ error: 'פרטי לקוח הם חובה' }, { status: 400 });

  console.log('[create-full] STEP 1: resolving customer', { hasId: !!לקוח.id });

  // 1. Find or create customer
  let customerId: string;
  if (לקוח.id) {
    customerId = לקוח.id;
  } else {
    const { data: created, error } = await supabase
      .from('לקוחות')
      .insert(לקוח)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: `יצירת לקוח נכשלה: ${error.message}` }, { status: 500 });
    customerId = created!.id;
  }

  console.log('[create-full] STEP 2: calculating totals', { customerId });

  // 2. Calculate totals
  let subtotal = 0;
  for (const item of מוצרים) subtotal += (item.כמות || 1) * (item.מחיר_ליחידה || 0);
  for (const pkg of מארזי_פטיפורים) subtotal += (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0);

  const discountType: 'ללא' | 'אחוז' | 'סכום' = הזמנה?.סוג_הנחה || 'ללא';
  const discountValue = Number(הזמנה?.ערך_הנחה || 0);
  let discount = 0;
  if (discountType === 'אחוז') {
    discount = +(subtotal * discountValue / 100).toFixed(2);
  } else if (discountType === 'סכום') {
    discount = Math.min(subtotal, discountValue);
  }

  const shipping = הזמנה?.דמי_משלוח || 0;
  const total = Math.max(0, subtotal - discount + shipping);

  console.log('[create-full] STEP 3: inserting order into DB', { customerId, total, subtotal });

  // 3. Create order — THIS IS THE ONLY INSERT TO הזמנות IN THIS HANDLER
  const { data: order, error: orderError } = await supabase
    .from('הזמנות')
    .insert({
      מספר_הזמנה: generateOrderNumber(),
      לקוח_id: customerId,
      סטטוס_הזמנה: הזמנה?.סטטוס_הזמנה || 'חדשה',
      הזמנה_דחופה: הזמנה?.הזמנה_דחופה || false,
      תאריך_הזמנה: הזמנה?.תאריך_הזמנה || new Date().toISOString().split('T')[0],
      תאריך_אספקה: הזמנה?.תאריך_אספקה || null,
      שעת_אספקה: הזמנה?.שעת_אספקה || null,
      delivery_time_flexible: הזמנה?.delivery_time_flexible === true,
      סוג_אספקה: הזמנה?.סוג_אספקה || 'איסוף עצמי',
      שם_מקבל: הזמנה?.שם_מקבל || null,
      טלפון_מקבל: הזמנה?.טלפון_מקבל || null,
      כתובת_מקבל_ההזמנה: הזמנה?.כתובת_מקבל_ההזמנה || null,
      עיר: הזמנה?.עיר || null,
      הוראות_משלוח: הזמנה?.הוראות_משלוח || null,
      דמי_משלוח: shipping,
      delivery_recipient_type: הזמנה?.delivery_recipient_type || null,
      סוג_הזמנה: הזמנה?.סוג_הזמנה || 'רגיל',
      אופן_תשלום: הזמנה?.אופן_תשלום || null,
      סטטוס_תשלום: הזמנה?.סטטוס_תשלום || 'ממתין',
      סוג_הנחה: discountType,
      ערך_הנחה: discountValue,
      סכום_לפני_הנחה: subtotal,
      סכום_הנחה: discount,
      סך_הכל_לתשלום: total,
      מקור_ההזמנה: הזמנה?.מקור_ההזמנה || null,
      ברכה_טקסט: הזמנה?.ברכה_טקסט || null,
      הערות_להזמנה: הזמנה?.הערות_להזמנה || null,
    })
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: `יצירת הזמנה נכשלה: ${orderError.message}` }, { status: 500 });

  console.log('[create-full] STEP 4: order inserted successfully', { orderId: order!.id, orderNumber: order!.מספר_הזמנה });

  // 4. Validate product IDs + business-only check
  const incomingProductIds = (מוצרים as Record<string, unknown>[])
    .map(i => i.מוצר_id as string)
    .filter(Boolean);

  // Resolve customer type for business-only check
  let customerType: string = לקוח?.סוג_לקוח || '';
  if (לקוח.id && !customerType) {
    const { data: custRow } = await supabase
      .from('לקוחות')
      .select('סוג_לקוח')
      .eq('id', customerId)
      .single();
    customerType = custRow?.סוג_לקוח || '';
  }

  let validProductIds = new Set<string>();
  if (incomingProductIds.length > 0) {
    const { data: existingProds } = await supabase
      .from('מוצרים_למכירה')
      .select('id, שם_מוצר, לקוחות_עסקיים_בלבד')
      .in('id', incomingProductIds);

    for (const prod of existingProds || []) {
      const p = prod as { id: string; שם_מוצר: string; לקוחות_עסקיים_בלבד: boolean };
      if (p.לקוחות_עסקיים_בלבד && customerType !== 'עסקי') {
        // Delete the just-created order before returning error
        await supabase.from('הזמנות').delete().eq('id', order!.id);
        return NextResponse.json(
          { error: `מוצר "${p.שם_מוצר}" זמין ללקוחות עסקיים בלבד` },
          { status: 403 },
        );
      }
    }
    validProductIds = new Set((existingProds || []).map((p: { id: string }) => p.id));
  }

  const validProducts = (מוצרים as Record<string, unknown>[]).filter(
    i => !i.מוצר_id || validProductIds.has(i.מוצר_id as string),
  );

  if (מוצרים.length > 0 && validProducts.length === 0) {
    await supabase.from('הזמנות').delete().eq('id', order!.id);
    return NextResponse.json({ error: 'לא נמצאו מוצרים תקינים להזמנה' }, { status: 400 });
  }

  // 5. Create regular product lines (validated only)
  for (const item of validProducts) {
    const { error: itemError } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: order!.id,
      מוצר_id: (item.מוצר_id as string) || null,
      סוג_שורה: 'מוצר',
      כמות: (item.כמות as number) || 1,
      מחיר_ליחידה: (item.מחיר_ליחידה as number) || 0,
      סהכ: ((item.כמות as number) || 1) * ((item.מחיר_ליחידה as number) || 0),
      הערות_לשורה: (item.הערות_לשורה as string) || null,
    });
    if (itemError) return NextResponse.json({ error: `יצירת פריט נכשלה: ${itemError.message}` }, { status: 500 });
  }

  // 6. Create package lines + petit-four selections
  for (const pkg of מארזי_פטיפורים) {
    // מוצר_id for package rows references מארזים, not מוצרים_למכירה — keep null to avoid FK violation
    const { data: pkgRow, error: pkgError } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: order!.id,
      מוצר_id: null,
      סוג_שורה: 'מארז',
      גודל_מארז: pkg.גודל_מארז || null,
      כמות: pkg.כמות || 1,
      מחיר_ליחידה: pkg.מחיר_ליחידה || 0,
      סהכ: (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0),
      הערות_לשורה: pkg.הערות_לשורה || null,
    }).select().single();

    if (pkgError) return NextResponse.json({ error: `יצירת מארז נכשלה: ${pkgError.message}` }, { status: 500 });

    if (pkg.פטיפורים && pkgRow) {
      for (const pf of pkg.פטיפורים) {
        const { error: pfError } = await supabase.from('בחירת_פטיפורים_בהזמנה').insert({
          שורת_הזמנה_id: pkgRow.id,
          פטיפור_id: pf.פטיפור_id,
          כמות: pf.כמות || 1,
        });
        if (pfError) return NextResponse.json({ error: `יצירת בחירת פטיפור נכשלה: ${pfError.message}` }, { status: 500 });
      }
    }
  }

  console.log('[create-full] STEP 5: order lines created, creating delivery/payment records');

  const isDraft = הזמנה?.סטטוס_הזמנה === 'טיוטה';

  // 7. Create delivery record (skip for drafts).
  // Initial status MUST be 'ממתין' — a brand-new delivery has not yet been
  // handed to a courier. Defaulting to 'נאסף' here would (a) lie about the
  // physical state, (b) make the row look already-collected on the dashboard,
  // and (c) sit in a state that the WhatsApp-to-courier trigger expects to
  // *transition into*. Status is only allowed to advance via the dedicated
  // PATCH /api/deliveries/[id] flow, never at creation.
  //
  // Dedup guard: even though create-full runs on a brand-new order id, the
  // check costs ~1ms and prevents duplicates if a future caller ever
  // resubmits with the same order id (the 60s in-memory idempotency cache
  // covers this for repeat clients, but defense-in-depth is cheap).
  if (!isDraft && משלוח) {
    const { data: existingDelivery } = await supabase
      .from('משלוחים').select('id').eq('הזמנה_id', order!.id).maybeSingle();
    if (existingDelivery) {
      console.log('[create-full] delivery already exists for order — skipping insert. order:', order!.id, '| delivery:', existingDelivery.id);
    } else {
      const { data: createdDelivery, error: deliveryErr } = await supabase
        .from('משלוחים')
        .insert({
          הזמנה_id: order!.id,
          סטטוס_משלוח: 'ממתין',
          תאריך_משלוח: order!.תאריך_אספקה || null,
          שעת_משלוח: order!.שעת_אספקה || null,
          כתובת: משלוח.כתובת || order!.כתובת_מקבל_ההזמנה || null,
          עיר: משלוח.עיר || order!.עיר || null,
          הוראות_משלוח: משלוח.הוראות_משלוח || order!.הוראות_משלוח || null,
        })
        .select('id')
        .single();
      if (deliveryErr) {
        console.error('[create-full] delivery insert failed:', deliveryErr.message);
      } else {
        console.log(
          '[create-full] delivery created.',
          'order:',         order!.id,
          '| delivery:',    createdDelivery?.id,
          '| date:',        order!.תאריך_אספקה || null,
          '| time:',        order!.שעת_אספקה   || null,
          '| status: ממתין',
        );
      }
    }
  }

  // 8. Create payment record (skip for drafts)
  if (!isDraft && תשלום) {
    await supabase.from('תשלומים').insert({
      הזמנה_id: order!.id,
      סכום: תשלום.סכום || total,
      אמצעי_תשלום: תשלום.אמצעי_תשלום || 'מזומן',
      סטטוס_תשלום: תשלום.סטטוס_תשלום || 'ממתין',
      תאריך_תשלום: תשלום.תאריך_תשלום || new Date().toISOString().split('T')[0],
    });
  }

  const { data: fullOrder } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', order!.id)
    .single();

  const { data: fullItems } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', order!.id);

  // Send order summary email — non-blocking, never fails the order (skip for drafts)
  if (isDraft) {
    console.log('[create-full] draft order — skipping email and admin alert');
    const responseBody = { data: { ...fullOrder, מוצרים_בהזמנה: fullItems || [] } };
    if (clientRequestId) {
      idempotencyCache.set(clientRequestId, { orderId: order!.id, responseBody, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
    }
    return NextResponse.json(responseBody, { status: 201 });
  }

  const emailCustomer = (fullOrder as Record<string, unknown>)?.['לקוחות'] as Record<string, string> | null;
  const emailTo = emailCustomer?.['אימייל'];
  const emailName = emailCustomer ? `${emailCustomer['שם_פרטי'] || ''} ${emailCustomer['שם_משפחה'] || ''}`.trim() : '';

  console.log('[create-full] email — to:', emailTo || 'NO EMAIL', '| name:', emailName);

  if (emailTo && !isInternalEmail(emailTo)) {
    const o = fullOrder as Record<string, unknown>;
    const emailOrderData: OrderEmailData = {
      orderNumber: (o['מספר_הזמנה'] as string) || '',
      orderDate: (o['תאריך_הזמנה'] as string) || new Date().toISOString().split('T')[0],
      deliveryDate: (o['תאריך_אספקה'] as string) || null,
      subtotal: Number(o['סכום_לפני_הנחה'] || 0),
      discount: Number(o['סכום_הנחה'] || 0),
      total: Number(o['סך_הכל_לתשלום'] || 0),
      // Drives the show-VAT block in the email: business + non-satmar gets
      // pre-VAT/VAT/with-VAT rows; everything else hides them.
      customerType: customerType || null,
      orderType: (o['סוג_הזמנה'] as string) || null,
      items: (fullItems || []).map((item: Record<string, unknown>) => {
        const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
        const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
        // Structured petit-four list — the email template renders this as a
        // vertical sub-list under the product name, not stuffed into name.
        const petitFours = (pfSelections ?? [])
          .map(s => {
            const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
            return pf?.['שם_פטיפור']
              ? { name: pf['שם_פטיפור'], quantity: Number(s['כמות'] ?? 0) }
              : null;
          })
          .filter((p): p is { name: string; quantity: number } => p !== null && p.quantity > 0);

        const isPackage = item['סוג_שורה'] === 'מארז';
        const name = isPackage
          ? `מארז ${item['גודל_מארז'] || ''} פטיפורים`
          : (prod?.['שם_מוצר'] as string) || 'פריט';
        return {
          name,
          quantity: Number(item['כמות'] || 1),
          unitPrice: Number(item['מחיר_ליחידה'] || 0),
          lineTotal: Number(item['סהכ'] || 0),
          ...(isPackage && petitFours.length > 0 ? { petitFours } : {}),
        };
      }),
    };

    const emailContext: EmailContext = {
      customerId: customerId,
      orderId: order!.id,
    };
    void (async () => {
      try {
        console.log('[create-full] calling sendOrderEmail...');
        await sendOrderEmail(emailTo, emailName, emailOrderData, emailContext);
        console.log('[create-full] sendOrderEmail completed successfully');
      } catch (err) {
        console.error('[create-full] sendOrderEmail failed:', err);
      }
    })();
  } else {
    console.log('[create-full] skipping email —', emailTo ? 'internal address' : 'no email');
  }

  // NOTE: no admin alert from this path. Per owner request (2026-05) the
  // "הזמנה חדשה" notification is reserved for orders that arrive via the
  // public website — i.e. only the WooCommerce webhook fires it. Orders
  // created manually inside the CRM are already visible to the operator
  // who created them, so the alert is just noise.
  //
  // Removing the call here (rather than gating it with an env flag) keeps
  // the contract explicit and prevents accidental re-enable.

  // ── Inventory deduction on real order creation ────────────────────────
  // New policy (May 2026 — owner-driven): a real (non-draft) order
  // consumes stock immediately, regardless of payment status. Drafts
  // never deduct (they're temporary by definition). סאטמר orders never
  // deduct (existing business rule). The helper is idempotent via the
  // תנועות_מלאי net-ledger guard, so double-submit / replay is safe.
  if (!isDraft) {
    const orderType = (order as Record<string, unknown>)?.['סוג_הזמנה'] as string | undefined;
    if (orderType !== 'סאטמר') {
      console.log('[create-full] real order created — running deductOrderInventory. order:', order!.id);
      try {
        const result = await deductOrderInventory(supabase, order!.id);
        console.log('[create-full] deduction result:', JSON.stringify(result));
      } catch (err) {
        console.error('[create-full] deductOrderInventory threw (continuing):', err instanceof Error ? err.message : err);
      }
    }
  }

  // Activity log — single row per real new order. Drafts go through
  // finalize-draft; we don't double-log there.
  void logActivity({
    actor:        userActor(auth),
    module:       'orders',
    action:       'order_created',
    status:       'success',
    entityType:   'order',
    entityId:     order!.id,
    entityLabel:  `${(order as Record<string, unknown>)?.['מספר_הזמנה'] || ''}`.trim() || null,
    title:        'נוצרה הזמנה חדשה',
    description:  emailName ? `${emailName} · סה"כ ₪${total.toFixed(2)}` : `סה"כ ₪${total.toFixed(2)}`,
    metadata:     { customer_id: customerId, total, item_count: (מוצרים || []).length + (מארזי_פטיפורים || []).length, source: 'create-full' },
    request:      req,
  });

  console.log('[create-full] STEP 6: returning response for order', order!.id);

  // ── Cleanup orphan empty drafts for the same customer ───────────────────
  // Auto-save on /orders/new creates a draft the moment a customer is
  // picked. If the operator abandoned an earlier session (closed the
  // browser before adding any product), that draft is stuck as 'טיוטה'
  // with no מוצרים_בהזמנה rows — pure noise. Once a real order lands for
  // the same customer, the chance the operator ever returns to fill in
  // that empty draft is effectively zero. Delete it.
  //
  // Strict safety constraints:
  //   - customer match (won't touch other customers' drafts)
  //   - status='טיוטה' (won't touch real orders)
  //   - excludes the order we just created (we're not a draft anyway,
  //     but defensive)
  //   - only deletes drafts with ZERO line items (queried below)
  if (!isDraft && customerId) {
    void (async () => {
      try {
        const { data: customerDrafts } = await supabase
          .from('הזמנות')
          .select('id')
          .eq('לקוח_id', customerId)
          .eq('סטטוס_הזמנה', 'טיוטה')
          .neq('id', order!.id);
        const draftIds = (customerDrafts ?? []).map((r: { id: string }) => r.id);
        if (draftIds.length === 0) return;

        // For each candidate draft, check whether it has line items. We
        // only delete those that have NONE.
        const { data: itemRows } = await supabase
          .from('מוצרים_בהזמנה')
          .select('הזמנה_id')
          .in('הזמנה_id', draftIds);
        const draftsWithItems = new Set((itemRows ?? []).map((r: { הזמנה_id: string }) => r.הזמנה_id));
        const emptyDraftIds = draftIds.filter((id: string) => !draftsWithItems.has(id));
        if (emptyDraftIds.length === 0) return;

        const { error: delErr } = await supabase.from('הזמנות').delete().in('id', emptyDraftIds);
        if (delErr) {
          console.warn('[create-full] orphan-draft cleanup failed (continuing):', delErr.message);
        } else {
          console.log('[create-full] deleted', emptyDraftIds.length, 'orphan empty draft(s) for customer', customerId);
        }
      } catch (err) {
        console.warn('[create-full] orphan-draft cleanup unexpected error (continuing):', err instanceof Error ? err.message : err);
      }
    })();
  }

  const responseBody = { data: { ...fullOrder, מוצרים_בהזמנה: fullItems || [] } };

  // Cache result so duplicate requests within 60s get the same order back
  if (clientRequestId) {
    idempotencyCache.set(clientRequestId, {
      orderId: order!.id,
      responseBody,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    });
  }

  return NextResponse.json(responseBody, { status: 201 });
}
