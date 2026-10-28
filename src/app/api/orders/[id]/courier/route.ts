import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Assigns / clears a courier on the משלוחים row for this order.
// Updates ONLY the `courier_id` column on an existing row. When an approved
// משלוח order has no delivery row yet (e.g. a quote-converted order that was
// switched from איסוף עצמי to משלוח) the row is created here, in status
// 'ממתין', from the order's own date/time/address — otherwise the courier
// could never be assigned. Drafts, cancelled and pickup orders are refused.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  let body: { courier_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  // courier_id may be a UUID string or null (to unassign).
  const courierId: string | null =
    typeof body.courier_id === 'string' && body.courier_id.trim()
      ? body.courier_id.trim()
      : null;
  if (courierId && !UUID.test(courierId)) {
    return NextResponse.json({ error: 'שליח לא תקין' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from('משלוחים')
    .update({ courier_id: courierId })
    .eq('הזמנה_id', params.id)
    .select('id');

  if (error) {
    return dbErrorResponse(error, 'orders/[id]/courier');
  }
  if ((updated?.length ?? 0) > 0 || !courierId) return NextResponse.json({ ok: true });

  // No delivery row yet — create it for an approved single-recipient delivery.
  const { data: order, error: orderErr } = await supabase
    .from('הזמנות')
    .select('סטטוס_הזמנה, סוג_אספקה, מרובה_נמענים, תאריך_אספקה, שעת_אספקה, כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח')
    .eq('id', params.id)
    .maybeSingle();
  if (orderErr) return dbErrorResponse(orderErr, 'orders/[id]/courier load order');
  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 });
  if (order.סוג_אספקה !== 'משלוח') {
    return NextResponse.json({ error: 'ההזמנה היא איסוף עצמי — אין משלוח לשבץ אליו שליח' }, { status: 400 });
  }
  if (order.סטטוס_הזמנה === 'טיוטה') {
    return NextResponse.json({ error: 'יש לאשר את הטיוטה לפני שיבוץ שליח' }, { status: 400 });
  }
  if (order.סטטוס_הזמנה === 'בוטלה') {
    return NextResponse.json({ error: 'ההזמנה בוטלה' }, { status: 400 });
  }
  if (order.מרובה_נמענים === true) {
    return NextResponse.json({ error: 'בהזמנה לכמה נמענים משבצים שליח לכל משלוח בדף המשלוחים' }, { status: 400 });
  }

  const { data: created, error: insErr } = await supabase
    .from('משלוחים')
    .insert({
      הזמנה_id: params.id,
      סטטוס_משלוח: 'ממתין',
      courier_id: courierId,
      תאריך_משלוח: order.תאריך_אספקה || null,
      שעת_משלוח: order.שעת_אספקה || null,
      כתובת: order.כתובת_מקבל_ההזמנה || null,
      עיר: order.עיר || null,
      הוראות_משלוח: order.הוראות_משלוח || null,
    })
    .select('id')
    .single();
  if (insErr?.code === '23505') {
    // UNIQUE(הזמנה_id) — a parallel request created the row; assign on it.
    const { error: retryErr } = await supabase
      .from('משלוחים').update({ courier_id: courierId }).eq('הזמנה_id', params.id);
    if (retryErr) return dbErrorResponse(retryErr, 'orders/[id]/courier retry');
    return NextResponse.json({ ok: true });
  }
  if (insErr) return dbErrorResponse(insErr, 'orders/[id]/courier create delivery');
  console.log('[orders/courier] delivery created on assign — order:', params.id, '| delivery:', created?.id);
  return NextResponse.json({ ok: true, created: true });
}
