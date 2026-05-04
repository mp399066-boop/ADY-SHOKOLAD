import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { action, ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'נדרשות רשומות לפעולה' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'delete') {
      let succeeded = 0;
      let failed = 0;
      for (const id of ids) {
        const { error } = await supabase.from('לקוחות').delete().eq('id', id);
        if (error) {
          console.warn('[bulk-customers] delete failed:', id, error.message);
          failed++;
        } else {
          succeeded++;
        }
      }
      console.log(`[bulk-customers] delete — succeeded: ${succeeded}, failed: ${failed}`);
      return NextResponse.json({ succeeded, failed });
    }

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-customers] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
