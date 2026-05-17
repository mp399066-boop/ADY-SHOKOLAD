import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { sendSatmarSummaryEmail } from '@/lib/satmar-email';
import { AUTO_CREATE_MORNING_DOCUMENTS } from '@/lib/morning';
import { logActivity, userActor } from '@/lib/activity-log';

// Dedicated endpoint to mark an order as paid.
// Reads order + customer from DB only — never accepts amounts from the client.
// Skips invoice for satmar (sends summary email instead) and for barter (no document).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error: fetchErr } = await supabase
    .from('הזמנות')
    .select('id, סטטוס_תשלום, סוג_הזמנה, לקוחות(סוג_לקוח)')
    .eq('id', params.id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
  }

  const o = order as unknown as {
    id: string;
    סטטוס_תשלום: string | null;
    סוג_הזמנה: string | null;
    לקוחות: { סוג_לקוח: string | null } | null;
  };

  if (o.סטטוס_תשלום === 'שולם') {
    return NextResponse.json({
      ok: true,
      already_paid: true,
      invoice_action: 'skipped_already_paid',
    });
  }

  const isSatmar = o.סוג_הזמנה === 'סאטמר';
  const isBarter = o.לקוחות?.סוג_לקוח === 'בארטר' || o.סטטוס_תשלום === 'בארטר';

  const { error: updErr } = await supabase
    .from('הזמנות')
    .update({ סטטוס_תשלום: 'שולם', תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id);

  if (updErr) {
    console.error('[mark-paid] DB update failed:', updErr.message);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Receipt issuance is *always* manual now. Even when AUTO_CREATE_MORNING_DOCUMENTS
  // is flipped back on, receipts cannot be auto-issued from this endpoint —
  // there is no defensible payment method to send (silent fallback to the
  // order's אופן_תשלום caused WooCommerce bacs orders to label docs as bank
  // transfer in the past). The receipt is created by POST
  // /api/orders/[id]/create-document where the user picks the method.
  let invoiceAction: 'satmar_email' | 'barter_skipped' | 'manual_required';
  if (isSatmar) {
    invoiceAction = 'satmar_email';
    await sendSatmarSummaryEmail(params.id);
  } else if (isBarter) {
    invoiceAction = 'barter_skipped';
    console.log('[mark-paid] Barter order — no invoice/receipt created. order:', params.id);
  } else {
    invoiceAction = 'manual_required';
    if (AUTO_CREATE_MORNING_DOCUMENTS) {
      console.error('[mark-paid] AUTO_CREATE_MORNING_DOCUMENTS=true but receipt auto-call is disabled — issue manually. order:', params.id);
    } else {
      console.log('[mark-paid] auto-create OFF — סטטוס flipped, receipt requires manual issuance. order:', params.id);
    }
  }

  // Inventory: NOT deducted here. New policy (May 2026) — stock is deducted
  // at order creation/finalization, NOT at payment. Marking an order paid
  // has no inventory side-effect. The helper would no-op anyway (the order
  // already has a 'יציאה' ledger entry from creation), but the call is
  // removed for clarity and to keep the policy explicit in code.
  // void isSatmar, isBarter — referenced in logs above, no inventory branch.
  void isSatmar; void isBarter;

  void logActivity({
    actor:        userActor(auth),
    module:       'orders',
    action:       'order_marked_paid',
    status:       'success',
    entityType:   'order',
    entityId:     params.id,
    title:        'הזמנה סומנה כשולמה',
    metadata:     { invoice_action: invoiceAction },
    request:      _req,
  });

  return NextResponse.json({
    ok: true,
    payment_status: 'שולם',
    invoice_action: invoiceAction,
  });
}
