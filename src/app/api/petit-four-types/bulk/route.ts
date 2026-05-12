import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const { ids, mode, value } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'נדרשות רשומות לפעולה' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const num = Number(value) || 0;
    let succeeded = 0;
    let failed = 0;

    const { data: rows } = await supabase
      .from('סוגי_פטיפורים')
      .select('id, שם_פטיפור, כמות_במלאי')
      .in('id', ids);

    for (const row of rows ?? []) {
      const current = Number(row.כמות_במלאי) || 0;
      const next =
        mode === 'set' ? num :
        mode === 'add' ? current + num :
        Math.max(0, current - num);
      const { error } = await supabase
        .from('סוגי_פטיפורים')
        .update({ כמות_במלאי: next })
        .eq('id', row.id);
      if (error) { failed++; continue; }
      succeeded++;
      if (current !== next) {
        await recordStockMovement(supabase, {
          itemKind: 'פטיפור',
          itemId: row.id,
          itemName: row.שם_פטיפור || '',
          before: current,
          after: next,
          sourceKind: 'ידני',
          notes: `עדכון כמות מרוכז (${mode === 'set' ? 'הצב' : mode === 'add' ? 'הוסף' : 'הפחת'} ${num})`,
          createdBy: auth.email,
        });
      }
    }

    console.log(`[bulk-pf] mode=${mode} val=${num} — succeeded: ${succeeded}, failed: ${failed}`);
    return NextResponse.json({ succeeded, failed });
  } catch (err) {
    console.error('[bulk-pf] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
