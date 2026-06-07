export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  if ('שם_משימה' in body && !String(body.שם_משימה ?? '').trim())
    return NextResponse.json({ error: 'שם משימה הוא שדה חובה' }, { status: 400 });

  // Empty strings from the edit form must become NULL for FK/date/time columns,
  // otherwise Postgres rejects '' as an invalid uuid/date/time (create already
  // does this; edit didn't, which broke saving). Only touch keys actually sent
  // so partial updates (e.g. status-only) keep working.
  const update = { ...body };
  for (const key of ['עובד_id', 'הזמנה_id', 'תאריך_יעד', 'שעת_יעד']) {
    if (key in update && (update[key] === '' || update[key] === undefined)) update[key] = null;
  }

  const { data, error } = await supabase
    .from('משימות_עובדים')
    .update({ ...update, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select('*, עובדים(id, שם_עובד, תפקיד), הזמנות(id, מספר_הזמנה)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('משימות_עובדים')
    .delete()
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
