// Server-only: deleting an order — one code path for the single delete and
// the bulk delete so they can never behave differently.
//
// Owner's rules (Nov 2026):
//   • the order's items go back to stock;
//   • for an order that was already completed (הושלמה בהצלחה) the screen asks
//     first — stock returns only when `restoreCompleted` is set;
//   • an order with an issued invoice is deleted only after the operator marks
//     that the invoice was cancelled/credited in Morning (`invoiceCancelled`).
//     The CRM invoice rows go with the order (FK cascade), so their numbers are
//     kept in the activity log.
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { restoreOrderInventory, deductOrderInventory } from '@/lib/inventory-deduct';
import { logActivity, userActor } from '@/lib/activity-log';
import type { AuthorizedUser } from '@/lib/auth/requireAuthorizedUser';

export interface DeleteOrderOptions {
  restoreCompleted: boolean;
  invoiceCancelled: boolean;
}

export type DeleteOrderResult =
  | { ok: true; restored: boolean }
  | { ok: false; reason: 'not_found' | 'has_invoice' | 'linked_records' | 'failed' };

export async function deleteOrder(
  supabase: SupabaseClient,
  orderId: string,
  opts: DeleteOrderOptions,
  auth: AuthorizedUser,
  req: NextRequest,
): Promise<DeleteOrderResult> {
  const { data: pre } = await supabase
    .from('הזמנות').select('מספר_הזמנה, סטטוס_הזמנה').eq('id', orderId).maybeSingle();
  if (!pre) return { ok: false, reason: 'not_found' };
  const preRow = pre as unknown as { מספר_הזמנה: string | null; סטטוס_הזמנה: string | null };
  const label = String(preRow.מספר_הזמנה || '').trim() || null;
  const status = preRow.סטטוס_הזמנה;

  // ── Invoice guard ─────────────────────────────────────────────────────
  const { data: invoices, error: invErr } = await supabase
    .from('חשבוניות').select('מספר_חשבונית, סוג_מסמך').eq('הזמנה_id', orderId);
  if (invErr) {
    console.error('[order delete] invoice check failed', { orderId, code: invErr.code });
    return { ok: false, reason: 'failed' };
  }
  const invoiceNumbers = ((invoices ?? []) as unknown as { מספר_חשבונית: string | null }[]).map(i => String(i.מספר_חשבונית ?? '').replace(/^manual:/, '').trim());
  if (invoiceNumbers.length > 0 && !opts.invoiceCancelled) {
    void logActivity({
      actor: userActor(auth), module: 'orders', action: 'order_deleted', status: 'skipped',
      entityType: 'order', entityId: orderId, entityLabel: label,
      title: 'מחיקת הזמנה נעצרה — קיימת חשבונית שלא סומנה כבוטלה', request: req,
    });
    return { ok: false, reason: 'has_invoice' };
  }

  // ── Stock back ────────────────────────────────────────────────────────
  const shouldRestore = status !== 'הושלמה בהצלחה' || opts.restoreCompleted;
  let restored = false;
  if (shouldRestore) {
    try {
      const r = await restoreOrderInventory(supabase, orderId, 'deleted');
      restored = r.restored;
      console.log('[order delete] restore before delete', { orderId, result: r.restored ? 'restored' : r.reason });
    } catch (err) {
      console.error('[order delete] restore threw (continuing)', { orderId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const { error } = await supabase.from('הזמנות').delete().eq('id', orderId);
  if (error) {
    // The order stays — take back out the stock returned above.
    if (restored) {
      try { await deductOrderInventory(supabase, orderId); }
      catch (err) { console.error('[order delete] re-deduct after failed delete threw', { orderId, error: err instanceof Error ? err.message : String(err) }); }
    }
    const isFK = error.code === '23503' || /foreign key/i.test(error.message);
    void logActivity({
      actor: userActor(auth), module: 'orders', action: 'order_deleted', status: 'failed',
      entityType: 'order', entityId: orderId, entityLabel: label,
      title: 'מחיקת הזמנה נכשלה', errorMessage: error.code ?? 'delete_failed', request: req,
    });
    return { ok: false, reason: isFK ? 'linked_records' : 'failed' };
  }

  void logActivity({
    actor: userActor(auth), module: 'orders', action: 'order_deleted', status: 'success',
    entityType: 'order', entityId: orderId, entityLabel: label,
    title: 'הזמנה נמחקה',
    description: [
      invoiceNumbers.length ? `חשבונית סומנה כבוטלה: ${invoiceNumbers.join(', ')}` : null,
      restored ? 'המלאי הוחזר' : shouldRestore ? null : 'הזמנה שהושלמה — המלאי לא הוחזר',
    ].filter(Boolean).join(' · ') || undefined,
    metadata: { invoiceNumbers, restored, status },
    request: req,
  });
  return { ok: true, restored };
}

export const DELETE_ERRORS: Record<Exclude<DeleteOrderResult, { ok: true }>['reason'], { status: number; error: string }> = {
  not_found:      { status: 404, error: 'הזמנה לא נמצאה' },
  has_invoice:    { status: 409, error: 'להזמנה הופקה חשבונית. כדי למחוק, יש לבטל/לזכות אותה במורנינג ולסמן שהחשבונית בוטלה.' },
  linked_records: { status: 409, error: 'לא ניתן למחוק כי קיימות רשומות מקושרות' },
  failed:         { status: 500, error: 'מחיקת ההזמנה נכשלה' },
};
