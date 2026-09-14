// ============================================================================
// Shared "mark delivery delivered by token" logic.
//
// Both the JSON POST endpoint (the in-page button) and the new GET confirm
// page (the one-click email link) call this. Keeping the side-effect chain
// in one place — flip סטטוס_משלוח → 'נמסר', set delivered_at, complete the
// linked order, archive the order, fire the satmar email when relevant —
// stops the two paths from drifting apart.
//
// Idempotent: a second call with the same token returns { already: true }
// and does not re-write any rows.
// ============================================================================

import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logActivity, PUBLIC_TOKEN_ACTOR } from '@/lib/activity-log';
import { sendSatmarSummaryEmail } from '@/lib/satmar-email';

export type ConfirmOutcome =
  | { ok: false; status: 'invalid' }                             // bad/empty token, or no row matches
  | { ok: true;  status: 'already';   deliveryId: string }       // was already 'נמסר'
  | { ok: true;  status: 'delivered'; deliveryId: string; orderCompleted: boolean };

export async function markDeliveryDeliveredByToken(
  token: string,
  req?: NextRequest | Request | null,
): Promise<ConfirmOutcome> {
  if (!token) return { ok: false, status: 'invalid' };

  const supabase = createAdminClient();

  const { data: existing, error: fetchError } = await supabase
    .from('משלוחים')
    .select('id, הזמנה_id, סטטוס_משלוח')
    .eq('delivery_token', token)
    .maybeSingle();

  if (fetchError || !existing) {
    return { ok: false, status: 'invalid' };
  }

  // Idempotent: second click on the same email link.
  if (existing.סטטוס_משלוח === 'נמסר') {
    return { ok: true, status: 'already', deliveryId: String(existing.id) };
  }

  // 1. Flip the delivery row.
  const { error: updateError } = await supabase
    .from('משלוחים')
    .update({ סטטוס_משלוח: 'נמסר', delivered_at: new Date().toISOString() })
    .eq('id', existing.id);

  if (updateError) {
    console.error('[delivery-confirm] update failed:', updateError.message);
    return { ok: false, status: 'invalid' };
  }

  void logActivity({
    actor:       PUBLIC_TOKEN_ACTOR,
    module:      'deliveries',
    action:      'delivery_marked_delivered',
    status:      'success',
    entityType:  'delivery',
    entityId:    String(existing.id),
    title:       'משלוח סומן כנמסר דרך קישור שליח',
    description: 'השליח סימן את המשלוח כנמסר דרך הקישור הציבורי',
    request:     req ?? null,
  });

  // 2. Cascade to the linked order — סטטוס_הזמנה → 'הושלמה בהצלחה' + ארכיון.
  //    Mirrors PATCH /api/orders/[id]: archive + satmar email when relevant.
  //
  //    A multi-recipient order has one delivery row per recipient. Completing
  //    the order on the FIRST courier confirmation would archive it while the
  //    other stops are still out for delivery, so the cascade waits until
  //    every stop is marked נמסר. Single-stop orders are unaffected (their
  //    only row is the one we just flipped).
  let orderCompleted = false;
  if (existing.הזמנה_id) {
    const { data: siblings, error: siblingsErr } = await supabase
      .from('משלוחים')
      .select('id, סטטוס_משלוח')
      .eq('הזמנה_id', existing.הזמנה_id);

    const pending = (siblings || []).filter(
      (d: { id: string; סטטוס_משלוח: string }) => d.id !== existing.id && d.סטטוס_משלוח !== 'נמסר',
    );
    if (siblingsErr) {
      console.error('[delivery-confirm] sibling-stop check failed:', siblingsErr.message, '| order:', existing.הזמנה_id);
    }
    if (pending.length > 0) {
      console.log(
        '[delivery-confirm] order not completed —', pending.length,
        'stop(s) still pending | order:', existing.הזמנה_id,
      );
      return { ok: true, status: 'delivered', deliveryId: String(existing.id), orderCompleted: false };
    }

    const { data: orderRow } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, סטטוס_הזמנה, סוג_הזמנה')
      .eq('id', existing.הזמנה_id)
      .maybeSingle();

    if (orderRow && orderRow.סטטוס_הזמנה !== 'הושלמה בהצלחה') {
      const { error: orderUpdateErr } = await supabase
        .from('הזמנות')
        .update({
          סטטוס_הזמנה: 'הושלמה בהצלחה',
          ארכיון:       true,
          תאריך_עדכון:  new Date().toISOString(),
        })
        .eq('id', orderRow.id);

      if (orderUpdateErr) {
        console.error('[delivery-confirm] order completion failed:', orderUpdateErr.message);
        // Delivery flip already succeeded — that's the courier-facing
        // truth. Surface the order failure in logs but don't roll back.
      } else {
        orderCompleted = true;

        if (orderRow.סוג_הזמנה === 'סאטמר') {
          try { await sendSatmarSummaryEmail(orderRow.id); }
          catch (err) { console.error('[delivery-confirm] satmar email failed:', err instanceof Error ? err.message : err); }
        }

        void logActivity({
          actor:       PUBLIC_TOKEN_ACTOR,
          module:      'orders',
          action:      'order_completed_by_delivery',
          status:      'success',
          entityType:  'order',
          entityId:    String(orderRow.id),
          entityLabel: orderRow.מספר_הזמנה || null,
          title:       'הזמנה הושלמה בעקבות מסירת משלוח',
          description: 'סטטוס ההזמנה עודכן להושלמה בהצלחה לאחר שהמשלוח סומן כנמסר',
          oldValue:    { סטטוס_הזמנה: orderRow.סטטוס_הזמנה },
          newValue:    { סטטוס_הזמנה: 'הושלמה בהצלחה' },
          request:     req ?? null,
        });
      }
    }
  }

  return { ok: true, status: 'delivered', deliveryId: String(existing.id), orderCompleted };
}
