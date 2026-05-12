import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

// Bulk update כמות_במלאי for finished products (מוצרים_למכירה)
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

    // Read all current rows so we can ledger per-row before/after even in
    // 'set' mode (single bulk UPDATE replaced with per-row updates so the
    // movements log is accurate).
    const { data: rows } = await supabase
      .from('מוצרים_למכירה')
      .select('id, שם_מוצר, כמות_במלאי')
      .in('id', ids);

    for (const row of rows ?? []) {
      const current = Number(row.כמות_במלאי) || 0;
      const next =
        mode === 'set' ? num :
        mode === 'add' ? current + num :
        Math.max(0, current - num);
      const { error } = await supabase
        .from('מוצרים_למכירה')
        .update({ כמות_במלאי: next })
        .eq('id', row.id);
      if (error) { failed++; continue; }
      succeeded++;
      if (current !== next) {
        await recordStockMovement(supabase, {
          itemKind: 'מוצר',
          itemId: row.id,
          itemName: row.שם_מוצר || '',
          before: current,
          after: next,
          sourceKind: 'ידני',
          notes: `עדכון כמות מרוכז (${mode === 'set' ? 'הצב' : mode === 'add' ? 'הוסף' : 'הפחת'} ${num})`,
          createdBy: auth.email,
        });
      }
    }

    console.log(`[bulk-products-stock] mode=${mode} val=${num} — succeeded: ${succeeded}, failed: ${failed}`);
    return NextResponse.json({ succeeded, failed });
  } catch (err) {
    console.error('[bulk-products-stock] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
