export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { parseCatalogPatch, petitFourPatchSchema } from '@/lib/catalog-patch-schema';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';
import { missingColumnMessage } from '@/lib/db-error';
import { dbErrorResponse, dbErrorDetail } from '@/lib/api-error';

// Single petit-four type — for the shared edit window on the dashboard.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('סוגי_פטיפורים').select('*').eq('id', params.id).maybeSingle();
  if (error) return dbErrorResponse(error, 'petit-four-types/[id] GET');
  if (!data) return NextResponse.json({ error: 'הפטיפור לא נמצא' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const parsed = parseCatalogPatch(petitFourPatchSchema, await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const patch = parsed.data;

  const { data: prev } = await supabase
    .from('סוגי_פטיפורים')
    .select('שם_פטיפור, כמות_במלאי')
    .eq('id', params.id)
    .single();

  const { data, error } = await supabase
    .from('סוגי_פטיפורים')
    .update({ ...patch,תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    // Covers both the old case (migration 002's stock column) and any newer
    // manually-run migration that hasn't been applied yet — the helper names
    // the column so it's clear which one is missing.
    const missing = missingColumnMessage(error);
    return NextResponse.json({ error: missing ?? dbErrorDetail(error, 'petit-four-types/[id]') }, { status: missing ? 400 : 500 });
  }

  if (prev && data && Number(prev.כמות_במלאי) !== Number(data.כמות_במלאי)) {
    await recordStockMovement(supabase, {
      itemKind: 'פטיפור',
      itemId: params.id,
      itemName: data.שם_פטיפור || prev.שם_פטיפור || '',
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
  const { error } = await supabase.from('סוגי_פטיפורים').delete().eq('id', params.id);
  if (error) return dbErrorResponse(error, 'petit-four-types/[id]');
  return NextResponse.json({ success: true });
}
