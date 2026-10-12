export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { parseCatalogPatch, productPatchSchema } from '@/lib/catalog-patch-schema';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';
import { missingColumnMessage } from '@/lib/db-error';
import { dbErrorResponse, dbErrorDetail } from '@/lib/api-error';

// Single product — lets the shared edit window open from screens that only
// hold an id (dashboard alerts).
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('מוצרים_למכירה').select('*').eq('id', params.id).maybeSingle();
  if (error) return dbErrorResponse(error, 'products/[id] GET');
  if (!data) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const parsed = parseCatalogPatch(productPatchSchema, await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const patch = parsed.data;

  const { data: prev } = await supabase
    .from('מוצרים_למכירה')
    .select('שם_מוצר, כמות_במלאי')
    .eq('id', params.id)
    .single();

  const { data, error } = await supabase
    .from('מוצרים_למכירה')
    .update({ ...patch,תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    // A manually-run migration that hasn't been applied yet shows up here as
    // an unknown column; say so instead of leaking the raw Postgres text.
    const missing = missingColumnMessage(error);
    return NextResponse.json({ error: missing ?? dbErrorDetail(error, 'products/[id]') }, { status: missing ? 400 : 500 });
  }

  // Record movement only on actual stock change. Threshold/name edits stay
  // out of the ledger to keep it focused on inventory deltas.
  if (prev && data && Number(prev.כמות_במלאי) !== Number(data.כמות_במלאי)) {
    await recordStockMovement(supabase, {
      itemKind: 'מוצר',
      itemId: params.id,
      itemName: data.שם_מוצר || prev.שם_מוצר || '',
      before: Number(prev.כמות_במלאי) || 0,
      after: Number(data.כמות_במלאי) || 0,
      sourceKind: 'ידני',
      notes: 'עדכון מלאי ידני',
      createdBy: auth.email,
    });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('מוצרים_למכירה').delete().eq('id', params.id);
  if (error) return dbErrorResponse(error, 'products/[id]');
  return NextResponse.json({ success: true });
}
