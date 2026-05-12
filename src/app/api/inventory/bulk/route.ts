import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const { action, ids, mode, value } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'נדרשות רשומות לפעולה' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'delete') {
      let succeeded = 0;
      let failed = 0;
      for (const id of ids) {
        const { error } = await supabase.from('מלאי_חומרי_גלם').delete().eq('id', id);
        if (error) {
          console.warn('[bulk-inventory] delete failed:', id, error.message);
          failed++;
        } else {
          succeeded++;
        }
      }
      console.log(`[bulk-inventory] delete — succeeded: ${succeeded}, failed: ${failed}`);
      return NextResponse.json({ succeeded, failed });
    }

    if (action === 'adjust_qty') {
      const num = Number(value) || 0;
      let succeeded = 0;
      let failed = 0;

      // For ALL modes we need the previous values up-front so we can write
      // ledger movements per row. The single bulk UPDATE is replaced with a
      // per-row UPDATE; cost is fine for the typical 10–50 row bulk action,
      // and the ledger gets accurate before/after for each item.
      const { data: rows } = await supabase
        .from('מלאי_חומרי_גלם')
        .select('id, שם_חומר_גלם, כמות_במלאי')
        .in('id', ids);

      for (const row of rows ?? []) {
        const current = Number(row.כמות_במלאי) || 0;
        const next =
          mode === 'set' ? num :
          mode === 'add' ? current + num :
          Math.max(0, current - num);

        const { error } = await supabase
          .from('מלאי_חומרי_גלם')
          .update({ כמות_במלאי: next })
          .eq('id', row.id);
        if (error) { failed++; continue; }
        succeeded++;
        if (current !== next) {
          await recordStockMovement(supabase, {
            itemKind: 'חומר_גלם',
            itemId: row.id,
            itemName: row.שם_חומר_גלם || '',
            before: current,
            after: next,
            sourceKind: 'ידני',
            notes: `עדכון כמות מרוכז (${mode === 'set' ? 'הצב' : mode === 'add' ? 'הוסף' : 'הפחת'} ${num})`,
            createdBy: auth.email,
          });
        }
      }

      console.log(`[bulk-inventory] adjust_qty mode=${mode} val=${num} — succeeded: ${succeeded}, failed: ${failed}`);
      return NextResponse.json({ succeeded, failed });
    }

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-inventory] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
