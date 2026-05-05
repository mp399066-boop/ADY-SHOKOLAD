import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

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
      const { error } = await supabase
        .from('הזמנות')
        .update({ סטטוס_תשלום: value, תאריך_עדכון: new Date().toISOString() })
        .in('id', ids);
      if (error) {
        console.warn('[bulk-orders] update_payment_status failed:', error.message);
        return NextResponse.json({ succeeded: 0, failed: ids.length });
      }
      console.log(`[bulk-orders] update_payment_status → ${value} for ${ids.length} orders`);
      return NextResponse.json({ succeeded: ids.length, failed: 0 });
    }

    return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 });
  } catch (err) {
    console.error('[bulk-orders] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
