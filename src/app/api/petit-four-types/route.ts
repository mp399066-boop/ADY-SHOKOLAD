export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { missingColumnMessage } from '@/lib/db-error';
import { dbErrorResponse, dbErrorDetail } from '@/lib/api-error';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('סוגי_פטיפורים').select('*').eq('פעיל', true).order('שם_פטיפור');
  if (error) return dbErrorResponse(error, 'petit-four-types');
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.שם_פטיפור) return NextResponse.json({ error: 'שם הפטיפור הוא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase
    .from('סוגי_פטיפורים')
    .insert(body)
    .select()
    .single();
  if (error) {
    const missing = missingColumnMessage(error);
    return NextResponse.json({ error: missing ?? dbErrorDetail(error, 'petit-four-types') }, { status: missing ? 400 : 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
