import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
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

      if (mode === 'set') {
        const { error } = await supabase
          .from('מלאי_חומרי_גלם')
          .update({ כמות_במלאי: num })
          .in('id', ids);
        if (error) {
          console.warn('[bulk-inventory] set qty failed:', error.message);
          failed = ids.length;
        } else {
          succeeded = ids.length;
        }
      } else {
        // add or subtract — need current value per row
        const { data: rows } = await supabase
          .from('מלאי_חומרי_גלם')
          .select('id, כמות_במלאי')
          .in('id', ids);

        for (const row of rows ?? []) {
          const current = Number(row.כמות_במלאי) || 0;
          const next =
            mode === 'add'
              ? current + num
              : Math.max(0, current - num);
          const { error } = await supabase
            .from('מלאי_חומרי_גלם')
            .update({ כמות_במלאי: next })
            .eq('id', row.id);
          if (error) failed++;
          else succeeded++;
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
