import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { restoreOrderInventory } from '@/lib/inventory-deduct';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const { action, ids, value } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'נדרשות רשומות לפעולה' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'delete') {
      let succeeded = 0;
      let failed = 0;
      for (const id of ids) {
        const { error } = await supabase.from('הזמנות').delete().eq('id', id);
        if (error) {
          console.warn('[bulk-orders] delete failed:', id, error.message);
          failed++;
        } else {
          succeeded++;
        }
      }
      console.log(`[bulk-orders] delete — succeeded: ${succeeded}, failed: ${failed}`);
      return NextResponse.json({ succeeded, failed });
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
