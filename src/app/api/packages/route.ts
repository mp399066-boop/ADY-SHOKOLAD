export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('מארזים').select('*').order('גודל_מארז');
  if (error) return dbErrorResponse(error, 'packages');
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.שם_מארז) return NextResponse.json({ error: 'שם המארז הוא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase
    .from('מארזים')
    .insert(body)
    .select()
    .single();
  if (error) return dbErrorResponse(error, 'packages');
  return NextResponse.json({ data }, { status: 201 });
}
