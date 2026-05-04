import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
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

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-products] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
