export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  forbiddenResponse,
  requireManagementUser,
  unauthorizedResponse,
} from '@/lib/auth/requireAuthorizedUser';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const body = await req.json();
  const patch: Record<string, unknown> = { תאריך_עדכון: new Date().toISOString() };
  if ('שם_עובדת' in body) patch.שם_עובדת = String(body.שם_עובדת || '').trim();
  if ('טלפון' in body) patch.טלפון = body.טלפון?.trim() || null;
  if ('תפקיד' in body) patch.תפקיד = body.תפקיד?.trim() || null;
  if ('פעילה' in body) patch.פעילה = body.פעילה !== false;
  if ('הערות' in body) patch.הערות = body.הערות?.trim() || null;

  if (patch.שם_עובדת === '') {
    return NextResponse.json({ error: 'שם עובדת הוא שדה חובה' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('עובדות_מטבח')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
