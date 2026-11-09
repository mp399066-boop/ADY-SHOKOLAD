export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { parseCatalogPatch, employeePatchSchema } from '@/lib/catalog-patch-schema';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const parsed = parseCatalogPatch(employeePatchSchema, await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.data;
  const { data, error } = await supabase
    .from('עובדים')
    .update({ ...body, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return dbErrorResponse(error, 'employees/[id]');
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('עובדים')
    .delete()
    .eq('id', params.id);
  if (error) return dbErrorResponse(error, 'employees/[id]');
  return NextResponse.json({ ok: true });
}
