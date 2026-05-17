import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { deductOrderInventory } from '@/lib/inventory-deduct';

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
      return NextResponse.json({ succeeded: ids.length, failed: 0 });
    }

    if (action === 'update_payment_status') {
      if (!value) return NextResponse.json({ error: 'חסר ערך סטטוס תשלום' }, { status: 400 });

      // Before the update, capture which orders are crossing the
      // ממתין/חלקי → שולם line. We need this for the inventory
      // deduction: deductOrderInventory itself is idempotent, but we
      // still want to skip orders that were already paid (no transition).
      // We also exclude סוג_הזמנה='סאטמר' to match PATCH /api/orders/[id]
      // behaviour (satmar orders never deduct).
      const willBecomePaid: string[] = [];
      if (value === 'שולם') {
        const { data: pre } = await supabase
          .from('הזמנות')
          .select('id, סטטוס_תשלום, סוג_הזמנה')
          .in('id', ids);
        for (const row of (pre ?? []) as Array<{ id: string; סטטוס_תשלום: string | null; סוג_הזמנה: string | null }>) {
          if (row.סטטוס_תשלום !== 'שולם' && row.סוג_הזמנה !== 'סאטמר') {
            willBecomePaid.push(row.id);
          }
        }
      }

      const { error } = await supabase
        .from('הזמנות')
        .update({ סטטוס_תשלום: value, תאריך_עדכון: new Date().toISOString() })
        .in('id', ids);
      if (error) {
        console.warn('[bulk-orders] update_payment_status failed:', error.message);
        return NextResponse.json({ succeeded: 0, failed: ids.length });
      }

      // Inventory deduction for every order whose status just crossed
      // into שולם. Each call is idempotent (תנועות_מלאי ledger guard);
      // failures are logged and don't roll back the status update.
      // PRE-FIX BUG: this path used to update status only, leaving stock
      // un-deducted whenever the operator used bulk mark-paid — the same
      // pattern that left ORD-260511-7707 / ORD-260512-1680 / ORD-260514-6055
      // with no תנועות_מלאי rows.
      let deducted = 0;
      for (const orderId of willBecomePaid) {
        try {
          const result = await deductOrderInventory(supabase, orderId);
          if (result.deducted) deducted++;
          else console.log('[bulk-orders] deduction skipped — reason:', result.reason, '| order:', orderId);
        } catch (err) {
          console.error('[bulk-orders] deduction failed for', orderId, ':', err instanceof Error ? err.message : err);
        }
      }
      console.log(`[bulk-orders] update_payment_status → ${value} for ${ids.length} orders | newly paid: ${willBecomePaid.length} | deducted: ${deducted}`);
      return NextResponse.json({ succeeded: ids.length, failed: 0, newly_paid: willBecomePaid.length, deducted });
    }

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-orders] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
