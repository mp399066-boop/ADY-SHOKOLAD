export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { parseCatalogPatch, businessSettingsPatchSchema } from '@/lib/catalog-patch-schema';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('business_settings').select('*').single();
  if (error) return dbErrorResponse(error, 'settings');
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const parsed = parseCatalogPatch(businessSettingsPatchSchema, await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.data;

  const { data: existing } = await supabase.from('business_settings').select('id').single();

  let result;
  if (existing) {
    result = await supabase
      .from('business_settings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from('business_settings')
      .insert({ ...body, updated_at: new Date().toISOString() })
      .select()
      .single();
  }

  if (result.error) return dbErrorResponse(result.error, 'settings');
  return NextResponse.json({ data: result.data });
}

