export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { syncPackagePriceToPriceList } from '@/lib/package-prices';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from('מארזים')
    .update({ ...body, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return dbErrorResponse(error, 'packages/[id]');
  // Package prices are read from the price list, so an edit here must land there too.
  const price = Number(data?.מחיר_מארז);
  if (body && 'מחיר_מארז' in body && Number(data?.גודל_מארז) > 0 && Number.isFinite(price) && price > 0) {
    await syncPackagePriceToPriceList(supabase, Number(data.גודל_מארז), price);
  }
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('מארזים').delete().eq('id', params.id);
  if (error) return dbErrorResponse(error, 'packages/[id]');
  return NextResponse.json({ success: true });
}
