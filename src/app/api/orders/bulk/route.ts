import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { restoreOrderInventory, deductOrderInventory } from '@/lib/inventory-deduct';
import { serverErrorResponse } from '@/lib/api-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;
const ACTIVE_STATUSES_FOR_REDEDUCT = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה'];

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const { action, ids, value } = (await req.json().catch(() => ({}))) as { action?: unknown; ids?: unknown; value?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'נדרשות רשומות לפעולה' }, { status: 400 });
    }
    if (ids.length > MAX_IDS || !ids.every(id => typeof id === 'string' && UUID_RE.test(id))) {
      return NextResponse.json({ error: 'רשימת הזמנות לא תקינה' }, { status: 400 });
    }
    if (value !== undefined && typeof value !== 'string') {
      return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'delete') {
      // Same guard as DELETE /api/orders/[id]: an order that already has a
      // financial document is never deleted (it would orphan the invoice).
      const { data: invoiced, error: invErr } = await supabase
        .from('חשבוניות').select('הזמנה_id').in('הזמנה_id', ids);
      if (invErr) {
        console.error('[bulk-orders] invoice-guard query failed:', invErr.code);
        return NextResponse.json({ error: 'שגיאה בבדיקת חשבוניות' }, { status: 500 });
      }
      const hasInvoice = new Set((invoiced ?? []).map((r: { הזמנה_id: string }) => r.הזמנה_id));
      const { data: pre } = await supabase.from('הזמנות').select('id, סטטוס_הזמנה').in('id', ids);
      const statusById = new Map(((pre ?? []) as { id: string; סטטוס_הזמנה: string | null }[]).map(r => [r.id, r.סטטוס_הזמנה]));

      let succeeded = 0;
      let failed = 0;
      let blocked = 0;
      for (const id of ids as string[]) {
        if (hasInvoice.has(id)) { blocked++; failed++; continue; }
        // Give the stock back before the order disappears (same as a cancel).
        // A completed order's goods really left, so nothing returns for it.
        let restoredBeforeDelete = false;
        if (statusById.get(id) !== 'הושלמה בהצלחה') {
          try { restoredBeforeDelete = (await restoreOrderInventory(supabase, id)).restored; }
          catch (err) { console.error('[bulk-orders] restore before delete threw for', id, ':', err instanceof Error ? err.message : err); }
        }
        const { error } = await supabase.from('הזמנות').delete().eq('id', id);
        if (error && restoredBeforeDelete) {
          // The order stays — take back out the stock returned just above.
          try { await deductOrderInventory(supabase, id); }
          catch (err) { console.error('[bulk-orders] re-deduct after failed delete threw for', id, ':', err instanceof Error ? err.message : err); }
        }
        if (error) {
          console.warn('[bulk-orders] delete failed:', id, error.message);
          failed++;
        } else {
          succeeded++;
        }
      }
      console.log(`[bulk-orders] delete — succeeded: ${succeeded}, failed: ${failed}, blocked by invoice: ${blocked}`);
      return NextResponse.json({ succeeded, failed, blocked });
    }

    if (action === 'update_status') {
      if (!value) return NextResponse.json({ error: 'חסר ערך סטטוס' }, { status: 400 });

      // Pre-state snapshot so we can detect first-time transitions into
      // בוטלה (the trigger for inventory restore). Cheap one query.
      const { data: pre } = await supabase
        .from('הזמנות')
        .select('id, סטטוס_הזמנה, סוג_הזמנה')
        .in('id', ids);
      type PreRow = { id: string; סטטוס_הזמנה: string | null; סוג_הזמנה: string | null };
      const preById = new Map<string, PreRow>(((pre ?? []) as PreRow[]).map(r => [r.id, r]));

      const patch: Record<string, unknown> = {
        סטטוס_הזמנה: value,
        תאריך_עדכון: new Date().toISOString(),
      };
      if (value === 'הושלמה בהצלחה') patch.ארכיון = true;

      const { error } = await supabase.from('הזמנות').update(patch).in('id', ids);
      if (error) {
        console.warn('[bulk-orders] update_status failed:', error.message);
        return NextResponse.json({ succeeded: 0, failed: ids.length });
      }
      console.log(`[bulk-orders] update_status → ${value} for ${ids.length} orders`);

      // ── Inventory restore on bulk-cancel ────────────────────────────────
      // Mirrors PATCH /api/orders/[id]: if status just crossed into בוטלה
      // and the order isn't סאטמר (those never deducted), call
      // restoreOrderInventory per affected order. Idempotent via the
      // net-ledger guard — orders that were never deducted are a no-op.
      let restored = 0;
      if (value === 'בוטלה') {
        const toRestore = ids.filter(id => {
          const prev = preById.get(id);
          return prev && prev.סטטוס_הזמנה !== 'בוטלה' && prev.סוג_הזמנה !== 'סאטמר';
        });
        for (const orderId of toRestore) {
          try {
            const result = await restoreOrderInventory(supabase, orderId);
            if (result.restored) restored++;
            else console.log('[bulk-orders] restore skipped — reason:', result.reason, '| order:', orderId);
          } catch (err) {
            console.error('[bulk-orders] restoreOrderInventory threw for', orderId, ':', err instanceof Error ? err.message : err);
          }
        }
        console.log(`[bulk-orders] update_status → בוטלה | restored inventory for ${restored} orders`);
      }

      // ── Inventory re-deduct on bulk un-cancel ───────────────────────────
      // Mirrors PATCH /api/orders/[id]: an order brought back from בוטלה to an
      // active status takes its stock out again. Idempotent (net-ledger guard).
      if (ACTIVE_STATUSES_FOR_REDEDUCT.includes(value as string)) {
        const toDeduct = (ids as string[]).filter(id => {
          const prev = preById.get(id);
          return prev && prev.סטטוס_הזמנה === 'בוטלה' && prev.סוג_הזמנה !== 'סאטמר';
        });
        for (const orderId of toDeduct) {
          try { await deductOrderInventory(supabase, orderId); }
          catch (err) { console.error('[bulk-orders] deductOrderInventory threw for', orderId, ':', err instanceof Error ? err.message : err); }
        }
      }

      return NextResponse.json({ succeeded: ids.length, failed: 0, restored });
    }

    if (action === 'update_payment_status') {
      if (!value) return NextResponse.json({ error: 'חסר ערך סטטוס תשלום' }, { status: 400 });

      // NEW POLICY (May 2026): payment-status changes have NO inventory
      // side effect. Stock deduction happens at order creation/finalization
      // (handled in create-full / finalize-draft / webhook). Marking an
      // order paid is now just a column update — receipts and invoices
      // continue to flow from the order-detail flow.
      const { error } = await supabase
        .from('הזמנות')
        .update({ סטטוס_תשלום: value, תאריך_עדכון: new Date().toISOString() })
        .in('id', ids);
      if (error) {
        console.warn('[bulk-orders] update_payment_status failed:', error.message);
        return NextResponse.json({ succeeded: 0, failed: ids.length });
      }
      console.log(`[bulk-orders] update_payment_status → ${value} for ${ids.length} orders (no inventory action)`);
      return NextResponse.json({ succeeded: ids.length, failed: 0 });
    }

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-orders] error:', err);
    return serverErrorResponse(err, 'orders/bulk');
  }
}
