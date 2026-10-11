export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('עובדים')
    .select('*')
    .order('שם_עובד');
  if (error) return dbErrorResponse(error, 'employees');
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.שם_עובד?.trim())
    return NextResponse.json({ error: 'שם עובד הוא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase
    .from('עובדים')
    .insert({
      שם_עובד:  body.שם_עובד.trim(),
      טלפון:    body.טלפון?.trim()  || null,
      אימייל:   body.אימייל?.trim() || null,
      תפקיד:    body.תפקיד?.trim()  || null,
      פעיל:     body.פעיל !== false,
    })
    .select()
    .single();
  if (error) return dbErrorResponse(error, 'employees');
  return NextResponse.json({ data }, { status: 201 });
}
