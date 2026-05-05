import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

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

    if (mode === 'set') {
      const { error } = await supabase
        .from('מוצרים_למכירה')
        .update({ כמות_במלאי: num })
        .in('id', ids);
      if (error) {
        console.warn('[bulk-products-stock] set failed:', error.message);
        failed = ids.length;
      } else {
        succeeded = ids.length;
      }
    } else {
      const { data: rows } = await supabase
        .from('מוצרים_למכירה')
        .select('id, כמות_במלאי')
        .in('id', ids);

      for (const row of rows ?? []) {
        const current = Number(row.כמות_במלאי) || 0;
        const next = mode === 'add' ? current + num : Math.max(0, current - num);
        const { error } = await supabase
          .from('מוצרים_למכירה')
          .update({ כמות_במלאי: next })
          .eq('id', row.id);
        if (error) failed++;
        else succeeded++;
      }
    }

    console.log(`[bulk-products-stock] mode=${mode} val=${num} — succeeded: ${succeeded}, failed: ${failed}`);
    return NextResponse.json({ succeeded, failed });
  } catch (err) {
    console.error('[bulk-products-stock] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
