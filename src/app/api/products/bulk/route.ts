import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const { action, ids, value, mode } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'נדרשות רשומות לפעולה' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'delete') {
      let succeeded = 0;
      let failed = 0;
      for (const id of ids) {
        const { error } = await supabase.from('מוצרים_למכירה').delete().eq('id', id);
        if (error) {
          console.warn('[bulk-products] delete failed:', id, error.message);
          failed++;
        } else {
          succeeded++;
        }
      }
      console.log(`[bulk-products] delete — succeeded: ${succeeded}, failed: ${failed}`);
      return NextResponse.json({ succeeded, failed });
    }

    if (action === 'toggle_active') {
      const { error } = await supabase
        .from('מוצרים_למכירה')
        .update({ פעיל: value })
        .in('id', ids);
      if (error) {
        console.warn('[bulk-products] toggle_active failed:', error.message);
        return NextResponse.json({ succeeded: 0, failed: ids.length });
      }
      console.log(`[bulk-products] toggle_active — ids: ${ids.length}, value: ${value}`);
      return NextResponse.json({ succeeded: ids.length, failed: 0 });
    }

    if (action === 'update_price') {
      if (typeof value !== 'number') return NextResponse.json({ error: 'חסר ערך מחיר' }, { status: 400 });

      if (mode === 'set') {
        const { error } = await supabase
          .from('מוצרים_למכירה')
          .update({ מחיר: value })
          .in('id', ids);
        if (error) {
          console.warn('[bulk-products] update_price set failed:', error.message);
          return NextResponse.json({ succeeded: 0, failed: ids.length });
        }
        return NextResponse.json({ succeeded: ids.length, failed: 0 });
      }

      // add / subtract / percent — need current prices
      const { data, error: fetchErr } = await supabase
        .from('מוצרים_למכירה')
        .select('id, מחיר')
        .in('id', ids);
      if (fetchErr || !data) {
        console.warn('[bulk-products] update_price fetch failed:', fetchErr?.message);
        return NextResponse.json({ succeeded: 0, failed: ids.length });
      }

      let succeeded = 0;
      let failed = 0;
      for (const row of data) {
        const cur = row.מחיר || 0;
        let newPrice: number;
        if (mode === 'add') newPrice = cur + value;
        else if (mode === 'subtract') newPrice = Math.max(0, cur - value);
        else /* percent */ newPrice = Math.round(cur * (1 + value / 100) * 100) / 100;

        const { error } = await supabase
          .from('מוצרים_למכירה')
          .update({ מחיר: newPrice })
          .eq('id', row.id);
        if (error) { console.warn('[bulk-products] update_price row failed:', row.id, error.message); failed++; }
        else succeeded++;
      }
      console.log(`[bulk-products] update_price (${mode}) — succeeded: ${succeeded}, failed: ${failed}`);
      return NextResponse.json({ succeeded, failed });
    }

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-products] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
