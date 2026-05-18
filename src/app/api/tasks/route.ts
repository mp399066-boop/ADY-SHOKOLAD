export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const orderId    = searchParams.get('order_id');
  const employeeId = searchParams.get('employee_id');
  const status     = searchParams.get('status');

  let query = supabase
    .from('משימות_עובדים')
    .select('*, עובדים(id, שם_עובד, תפקיד), הזמנות(id, מספר_הזמנה)')
    .order('תאריך_יצירה', { ascending: false });

  if (orderId)    query = query.eq('הזמנה_id', orderId);
  if (employeeId) query = query.eq('עובד_id', employeeId);
  if (status)     query = query.eq('סטטוס', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.שם_משימה?.trim())
    return NextResponse.json({ error: 'שם משימה הוא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase
    .from('משימות_עובדים')
    .insert({
      שם_משימה:    body.שם_משימה.trim(),
      פירוט:       body.פירוט?.trim()      || null,
      הזמנה_id:    body.הזמנה_id           || null,
      עובד_id:     body.עובד_id            || null,
      תאריך_יעד:   body.תאריך_יעד          || null,
      שעת_יעד:     body.שעת_יעד?.trim()    || null,
      סטטוס:       body.סטטוס              || 'ממתין',
      עדיפות:      body.עדיפות             || 'רגיל',
      הערות:       body.הערות?.trim()      || null,
      נוצר_על_ידי: auth.email              ?? null,
    })
    .select('*, עובדים(id, שם_עובד, תפקיד), הזמנות(id, מספר_הזמנה)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
