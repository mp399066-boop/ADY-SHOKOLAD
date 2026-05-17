export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  forbiddenResponse,
  requireManagementUser,
  unauthorizedResponse,
} from '@/lib/auth/requireAuthorizedUser';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const body = await req.json();
  const name = typeof body.שם_עובדת === 'string' ? body.שם_עובדת.trim() : '';
  if (!name) return NextResponse.json({ error: 'שם עובדת הוא שדה חובה' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('עובדות_מטבח')
    .insert({
      שם_עובדת: name,
      טלפון: body.טלפון?.trim() || null,
      תפקיד: body.תפקיד?.trim() || null,
      פעילה: body.פעילה !== false,
      הערות: body.הערות?.trim() || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
