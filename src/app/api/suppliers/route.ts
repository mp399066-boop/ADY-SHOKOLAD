export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('ספקים')
    .select('*')
    .order('שם_ספק');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.שם_ספק?.trim()) {
    return NextResponse.json({ error: 'שם ספק הוא שדה חובה' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ספקים')
    .insert({
      שם_ספק:   body.שם_ספק.trim(),
      טלפון:    body.טלפון   || null,
      אימייל:   body.אימייל  || null,
      איש_קשר:  body.איש_קשר || null,
      הערות:    body.הערות   || null,
      פעיל:     body.פעיל ?? true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
