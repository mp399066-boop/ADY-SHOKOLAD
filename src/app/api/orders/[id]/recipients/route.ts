export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import {
  normalizeRecipients,
  fetchOrderRecipients,
  syncRecipientDeliveries,
  isMissingRecipientSchema,
  MISSING_SCHEMA_MESSAGE,
  type RecipientRow,
} from '@/lib/order-recipients';

// ---------------------------------------------------------------------------
// Recipients of an existing order.
//
// Unlike the create/draft paths (which replace the whole list wholesale), this
// route updates IN PLACE: rows keep their ids, so the delivery already on the
// road — its courier, its status, its tracking token — survives an address
// correction. Only recipients the operator actually removed are deleted.
// ---------------------------------------------------------------------------

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  return NextResponse.json({ data: await fetchOrderRecipients(supabase, params.id) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  let body: { נמענים?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const orderId = params.id;

  const { data: order, error: orderErr } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, תאריך_אספקה, שעת_אספקה, כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח, מרובה_נמענים')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr && isMissingRecipientSchema(orderErr)) {
    return NextResponse.json({ error: MISSING_SCHEMA_MESSAGE }, { status: 500 });
  }
  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  // The client sends the id of an existing row in `key`; a row with no
  // matching id is a new recipient. normalizeRecipients has already trimmed,
  // length-capped and dropped nameless entries.
  const incoming = normalizeRecipients(body.נמענים);

  const existing = await fetchOrderRecipients(supabase, orderId);
  const existingById = new Map(existing.map(r => [r.id, r]));

  const keptIds = new Set<string>();
  const finalRows: RecipientRow[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const r = incoming[i];
    const fields = {
      שם_נמען: r.שם_נמען,
      טלפון_נמען: r.טלפון_נמען,
      כתובת: r.כתובת,
      עיר: r.עיר,
      הוראות_משלוח: r.הוראות_משלוח,
      ברכה_טקסט: r.ברכה_טקסט,
      הערות: r.הערות,
      סדר_תצוגה: i + 1,
    };

    // `key` names an existing row only when it really belongs to this order —
    // an id from anywhere else is treated as a brand-new recipient.
    if (existingById.has(r.key)) {
      const { data, error } = await supabase
        .from('נמעני_הזמנה')
        .update({ ...fields, תאריך_עדכון: new Date().toISOString() })
        .eq('id', r.key)
        .eq('הזמנה_id', orderId)
        .select()
        .single();
      if (error) return NextResponse.json({ error: `עדכון נמען נכשל: ${error.message}` }, { status: 500 });
      keptIds.add(r.key);
      finalRows.push(data as RecipientRow);
      continue;
    }

    const { data, error } = await supabase
      .from('נמעני_הזמנה')
      .insert({ הזמנה_id: orderId, ...fields })
      .select()
      .single();
    if (error) {
      if (isMissingRecipientSchema(error)) {
        return NextResponse.json({ error: MISSING_SCHEMA_MESSAGE }, { status: 500 });
      }
      return NextResponse.json({ error: `יצירת נמען נכשלה: ${error.message}` }, { status: 500 });
    }
    finalRows.push(data as RecipientRow);
  }

  // Remove the ones the operator dropped — but a recipient whose delivery has
  // already been handed to a courier is refused: deleting it would erase a
  // delivery that physically happened (its משלוחים row cascades away with it).
  // Every removal is checked BEFORE any of them is applied, so a refusal
  // leaves the order exactly as it was rather than half-edited.
  const removed = existing.filter(r => !keptIds.has(r.id));
  const blocked: string[] = [];
  for (const r of removed) {
    const { data: stops } = await supabase
      .from('משלוחים')
      .select('id, סטטוס_משלוח')
      .eq('הזמנה_id', orderId)
      .eq('נמען_id', r.id);
    const handedOver = (stops || []).some(
      (s: { סטטוס_משלוח: string }) => s.סטטוס_משלוח === 'נמסר' || s.סטטוס_משלוח === 'נאסף',
    );
    if (handedOver) blocked.push(r.שם_נמען);
  }

  if (blocked.length > 0) {
    return NextResponse.json(
      { error: `לא ניתן להסיר נמען שהמשלוח אליו כבר נאסף או נמסר: ${blocked.join(', ')}` },
      { status: 409 },
    );
  }

  for (const r of removed) {
    const { error } = await supabase
      .from('נמעני_הזמנה')
      .delete()
      .eq('id', r.id)
      .eq('הזמנה_id', orderId);
    if (error) return NextResponse.json({ error: `מחיקת נמען נכשלה: ${error.message}` }, { status: 500 });
  }

  const hasRecipients = finalRows.length > 0;

  // Keep the order flag in step, and re-point the delivery rows at the new
  // addresses. syncRecipientDeliveries never resets a row that already exists
  // beyond its address/date, so an assigned courier stays assigned.
  if (order.מרובה_נמענים !== hasRecipients) {
    await supabase.from('הזמנות').update({ מרובה_נמענים: hasRecipients }).eq('id', orderId);
  }

  if (hasRecipients) {
    await syncRecipientDeliveries(supabase, orderId, finalRows, {
      תאריך_משלוח: order.תאריך_אספקה ?? null,
      שעת_משלוח: order.שעת_אספקה ?? null,
      כתובת: order.כתובת_מקבל_ההזמנה ?? null,
      עיר: order.עיר ?? null,
      הוראות_משלוח: order.הוראות_משלוח ?? null,
    });
  }

  console.log(
    '[order recipients PUT] order:', orderId,
    '| kept:', keptIds.size,
    '| added:', finalRows.length - keptIds.size,
    '| removed:', removed.length,
  );

  void logActivity({
    actor: userActor(auth),
    module: 'orders',
    action: 'order_recipients_updated',
    status: 'success',
    entityType: 'order',
    entityId: orderId,
    entityLabel: order.מספר_הזמנה || null,
    title: `עדכון נמעני ההזמנה (${finalRows.length})`,
    request: req,
  });

  return NextResponse.json({ data: finalRows });
}
