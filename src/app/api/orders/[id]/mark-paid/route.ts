import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { sendSatmarSummaryEmail } from '@/lib/satmar-email';
import { callMorning } from '@/lib/morning';

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

  let invoiceAction: 'satmar_email' | 'barter_skipped' | 'morning_receipt';
  if (isSatmar) {
    invoiceAction = 'satmar_email';
    await sendSatmarSummaryEmail(params.id);
  } else if (isBarter) {
    invoiceAction = 'barter_skipped';
    console.log('[mark-paid] Barter order — no invoice/receipt created. order:', params.id);
  } else {
    invoiceAction = 'morning_receipt';
    await callMorning(params.id, 'receipt');
  }

  return NextResponse.json({
    ok: true,
    payment_status: 'שולם',
    invoice_action: invoiceAction,
  });
}
