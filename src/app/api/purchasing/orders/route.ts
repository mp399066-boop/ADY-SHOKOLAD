export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.items?.length) {
    return NextResponse.json({ error: 'לא נבחרו פריטים' }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from('הזמנות_רכש')
    .insert({
      ספק_id:         body.ספק_id   || null,
      תאריך_הזמנה:   new Date().toISOString().split('T')[0],
      סטטוס:          'נשלח',
      הערות:          body.הערות    || null,
      נוצר_על_ידי:   auth.email,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: orderError?.message || 'שגיאה ביצירת הזמנת רכש' },
      { status: 500 },
    );
  }

  const items = (body.items as Array<{ חומר_גלם_id?: string; שם_פריט: string; כמות: number; יחידה?: string }>).map(item => ({
    הזמנת_רכש_id: order.id,
    חומר_גלם_id:  item.חומר_גלם_id || null,
    שם_פריט:      item.שם_פריט,
    כמות:         item.כמות,
    יחידה:        item.יחידה || null,
  }));

  await supabase.from('פריטי_הזמנת_רכש').insert(items);

  return NextResponse.json({ data: order }, { status: 201 });
}
