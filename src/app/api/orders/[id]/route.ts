import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { sendSatmarSummaryEmail } from '@/lib/satmar-email';
import { AUTO_CREATE_MORNING_DOCUMENTS } from '@/lib/morning';
import { restoreOrderInventory, DEDUCT_INVENTORY_ON_ORDER_STATUS } from '@/lib/inventory-deduct';
import { logActivity, userActor } from '@/lib/activity-log';
// deploy trigger

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', params.id);

  const { data: delivery } = await supabase
    .from('משלוחים')
    .select('*')
    .eq('הזמנה_id', params.id)
    .single();

  const { data: payments } = await supabase
    .from('תשלומים')
    .select('*')
    .eq('הזמנה_id', params.id)
    .order('תאריך_תשלום', { ascending: false });

  const { data: invoices } = await supabase
    .from('חשבוניות')
    .select('*')
    .eq('הזמנה_id', params.id)
    .order('תאריך_יצירה', { ascending: false });

  const { data: files } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('entity_type', 'order')
    .eq('entity_id', params.id)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({
    data: {
      ...order,
      מוצרים_בהזמנה: items || [],
      משלוח: delivery || null,
      תשלומים: payments || [],
      חשבוניות: invoices || [],
      קבצים: files || [],
    },
  });
}

// Call Morning Edge Function for a specific document type.
//
// HARD RULE (mirrors src/lib/morning.ts): only `tax_invoice` is callable
// from a status-driven trigger. PAYMENT_DOCS (receipt, invoice_receipt)
// require an explicit payment_method which the EF now hard-requires — see
// the receipt branch below for what we do instead.
async function callMorning(orderId: string, documentType: 'tax_invoice'): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error('[invoice] Missing env vars — SUPABASE_URL:', !!supabaseUrl, '| SERVICE_ROLE_KEY:', !!serviceRoleKey, '| WEBHOOK_SECRET:', !!webhookSecret);
    return;
  }
  try {
    console.log('[invoice] Calling Morning for', documentType, '— order:', orderId);
    const res = await fetch(`${supabaseUrl}/functions/v1/create-morning-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({
        type: 'UPDATE',
        table: 'הזמנות',
        document_type: documentType,
        record: { הזמנה_id: orderId },
        old_record: {},
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.error('[invoice] Morning failed:', res.status, JSON.stringify(body));
    else console.log('[invoice] Morning success:', JSON.stringify(body));
  } catch (err) {
    console.error('[invoice] Failed to call Morning:', err instanceof Error ? err.message : err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  console.log('[invoice] PATCH called — order:', params.id, '| body keys:', Object.keys(body).join(','), '| סטטוס_תשלום:', body.סטטוס_תשלום);
  console.log('[invoice] env — SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'MISSING', '| WEBHOOK_SECRET:', process.env.WEBHOOK_SECRET ? `set(${process.env.WEBHOOK_SECRET.length}chars)` : 'MISSING');

  // Fetch current state BEFORE update — needed for inventory check + invoice/satmar trigger
  const needPrev = body.סטטוס_הזמנה === 'בהכנה'
    || body.סטטוס_תשלום === 'שולם'
    || body.סטטוס_הזמנה === 'הושלמה בהצלחה'
    || body.סטטוס_הזמנה === 'בוטלה';   // restore-on-cancel needs prev order status
  let prevOrderStatus: string | null = null;
  let prevPaymentStatus: string | null = null;
  let orderType = 'רגיל';

  if (needPrev) {
    const { data: cur } = await supabase
      .from('הזמנות')
      .select('סטטוס_הזמנה, סטטוס_תשלום, סוג_הזמנה')
      .eq('id', params.id)
      .single();
    prevOrderStatus = cur?.סטטוס_הזמנה ?? null;
    prevPaymentStatus = cur?.סטטוס_תשלום ?? null;
    orderType = (cur as Record<string, unknown> | null)?.['סוג_הזמנה'] as string ?? 'רגיל';
    console.log('[invoice] prev — סטטוס_הזמנה:', prevOrderStatus, '| סטטוס_תשלום:', prevPaymentStatus, '| סוג_הזמנה:', orderType);
  }

  const updateData: Record<string, unknown> = { ...body, תאריך_עדכון: new Date().toISOString() };

  if (body.סטטוס_הזמנה === 'הושלמה בהצלחה') {
    updateData.ארכיון = true;
  }

  const { data, error } = await supabase
    .from('הזמנות')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Sync delivery row when delivery-relevant order fields change ─────
  // Without this, editing an order's תאריך_אספקה / שעת_אספקה / address
  // would leave the linked משלוחים row stale, causing the dashboard's
  // "today" filter (which keys off משלוחים.תאריך_משלוח) to show the
  // delivery on the WRONG day. We mirror only the fields that were
  // actually present in the body (so a PATCH that only touched a
  // status pill doesn't accidentally null out the delivery address).
  const deliveryFieldMap: Array<[string, string]> = [
    ['תאריך_אספקה',         'תאריך_משלוח'],
    ['שעת_אספקה',           'שעת_משלוח'],
    ['כתובת_מקבל_ההזמנה',   'כתובת'],
    ['עיר',                  'עיר'],
    ['הוראות_משלוח',        'הוראות_משלוח'],
  ];
  const deliveryUpdate: Record<string, unknown> = {};
  for (const [orderField, deliveryField] of deliveryFieldMap) {
    if (Object.prototype.hasOwnProperty.call(body, orderField)) {
      deliveryUpdate[deliveryField] = body[orderField];
    }
  }
  if (Object.keys(deliveryUpdate).length > 0) {
    const { error: syncErr } = await supabase
      .from('משלוחים')
      .update(deliveryUpdate)
      .eq('הזמנה_id', params.id);
    if (syncErr) {
      // Soft fail — the order update already succeeded; we don't want a
      // sync glitch on the delivery row to look like an order-edit error.
      console.error('[order PATCH] delivery row sync failed (continuing):', syncErr.message, '| order:', params.id, '| fields:', Object.keys(deliveryUpdate));
    } else {
      console.log('[order PATCH] synced delivery row — order:', params.id, '| fields:', Object.keys(deliveryUpdate));
    }
  }

  // ── Activity log: status transitions ─────────────────────────────────
  // Two separate rows when both fields move in one PATCH (each is a
  // distinct operator decision). Skipped silently when nothing changed.
  const orderNumberLabel = String((data as Record<string, unknown>)?.['מספר_הזמנה'] || '').trim() || null;
  if (body.סטטוס_הזמנה && body.סטטוס_הזמנה !== prevOrderStatus) {
    void logActivity({
      actor:        userActor(auth),
      module:       'orders',
      action:       'order_status_changed',
      status:       'success',
      entityType:   'order',
      entityId:     params.id,
      entityLabel:  orderNumberLabel,
      title:        `שינוי סטטוס הזמנה: ${prevOrderStatus ?? '—'} → ${body.סטטוס_הזמנה}`,
      oldValue:     { סטטוס_הזמנה: prevOrderStatus },
      newValue:     { סטטוס_הזמנה: body.סטטוס_הזמנה },
      request:      req,
    });
  }
  if (body.סטטוס_תשלום && body.סטטוס_תשלום !== prevPaymentStatus) {
    void logActivity({
      actor:        userActor(auth),
      module:       'orders',
      action:       'payment_status_changed',
      status:       'success',
      entityType:   'order',
      entityId:     params.id,
      entityLabel:  orderNumberLabel,
      title:        `שינוי סטטוס תשלום: ${prevPaymentStatus ?? '—'} → ${body.סטטוס_תשלום}`,
      oldValue:     { סטטוס_תשלום: prevPaymentStatus },
      newValue:     { סטטוס_תשלום: body.סטטוס_תשלום },
      request:      req,
    });
  }

  // LEGACY-DELETED (May 2026 rev 2): the inline "deduct on חדשה→בהכנה"
  // block lived here, gated by DEDUCT_INVENTORY_ON_ORDER_STATUS. Removed
  // because the active policy is now "deduct on real order creation /
  // finalization" via the central deductOrderInventory helper (called
  // from create-full, finalize-draft, and the WC webhook). Status
  // transitions on PATCH no longer touch stock except for the
  // cancellation restore block above.

  // חשבונית מס / סאטמר: first time order status → הושלמה בהצלחה.
  // Morning issuance is gated behind AUTO_CREATE_MORNING_DOCUMENTS — when
  // off (current owner policy), only the satmar email side-effect runs and
  // tax-invoice creation happens manually via the order detail modal.
  if (body.סטטוס_הזמנה === 'הושלמה בהצלחה' && prevOrderStatus !== 'הושלמה בהצלחה') {
    if (orderType === 'סאטמר') {
      await sendSatmarSummaryEmail(params.id);
    } else if (AUTO_CREATE_MORNING_DOCUMENTS) {
      await callMorning(params.id, 'tax_invoice');
    } else {
      console.log('[invoice] auto-create OFF — skipping tax_invoice on הושלמה. order:', params.id);
    }
  }

  // ── INVENTORY RESTORE on first transition to סטטוס_הזמנה='בוטלה' ───────
  // New policy (May 2026 rev 2): inventory is deducted on order creation
  // and restored on cancellation. Payment-status transitions are no
  // longer the trigger for either — the per-order/bulk paid paths used
  // to call deductOrderInventory; that's been removed everywhere.
  //
  // restoreOrderInventory is idempotent via the net-ledger guard, so a
  // re-cancellation (after un-cancel) won't double-restore. סאטמר orders
  // never deducted in the first place — their net is 0 and restore is a
  // no-op, so we can skip the orderType gate here for safety.
  if (
    body.סטטוס_הזמנה === 'בוטלה'
    && prevOrderStatus !== 'בוטלה'
  ) {
    console.log('[inventory] order cancelled — running restoreOrderInventory. order:', params.id, '| prev status:', prevOrderStatus);
    try {
      const result = await restoreOrderInventory(supabase, params.id);
      console.log('[inventory] restore result:', JSON.stringify(result));
    } catch (err) {
      console.error('[inventory] restoreOrderInventory threw (continuing):', err instanceof Error ? err.message : err);
    }
  }

  // קבלה / סאטמר: first time payment status → שולם.
  //
  // Even when AUTO_CREATE_MORNING_DOCUMENTS is flipped back on, receipt
  // auto-issuance stays disabled — there is no defensible payment method
  // to send from a status trigger (the order's אופן_תשלום is unreliable;
  // WooCommerce bacs orders silently labelled docs as bank transfer when
  // we used to fall back to it). Receipts must be issued via POST
  // /api/orders/[id]/create-document where the user picks the method.
  if (body.סטטוס_תשלום === 'שולם' && prevPaymentStatus !== 'שולם') {
    if (orderType === 'סאטמר') {
      await sendSatmarSummaryEmail(params.id);
    } else if (AUTO_CREATE_MORNING_DOCUMENTS) {
      console.error('[invoice] receipt auto-call is intentionally disabled — payment method required. issue manually. order:', params.id);
    } else {
      console.log('[invoice] auto-create OFF — skipping receipt on שולם. order:', params.id);
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  // Capture order number before delete for the activity row.
  const { data: pre } = await supabase.from('הזמנות').select('מספר_הזמנה').eq('id', params.id).maybeSingle();
  const { error } = await supabase.from('הזמנות').delete().eq('id', params.id);
  if (error) {
    const isFK = error.message.includes('foreign key') || error.message.includes('violates');
    void logActivity({
      actor:        userActor(auth),
      module:       'orders',
      action:       'order_deleted',
      status:       'failed',
      entityType:   'order',
      entityId:     params.id,
      entityLabel:  String((pre as Record<string, unknown> | null)?.['מספר_הזמנה'] || '').trim() || null,
      title:        'מחיקת הזמנה נכשלה',
      errorMessage: error.message,
      request:      req,
    });
    return NextResponse.json(
      { error: isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : error.message },
      { status: isFK ? 409 : 500 },
    );
  }
  void logActivity({
    actor:        userActor(auth),
    module:       'orders',
    action:       'order_deleted',
    status:       'success',
    entityType:   'order',
    entityId:     params.id,
    entityLabel:  String((pre as Record<string, unknown> | null)?.['מספר_הזמנה'] || '').trim() || null,
    title:        'הזמנה נמחקה',
    request:      req,
  });
  return NextResponse.json({ success: true });
}
