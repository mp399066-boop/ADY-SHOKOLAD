export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  // Read the current row first so we can log a movement when כמות_במלאי
  // changes. If the body doesn't touch כמות_במלאי this still works — the
  // before/after check below short-circuits and no movement is recorded.
  const { data: prev } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('שם_חומר_גלם, כמות_במלאי')
    .eq('id', params.id)
    .single();

  const { data, error } = await supabase
    .from('מלאי_חומרי_גלם')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (prev && data && prev.כמות_במלאי !== data.כמות_במלאי) {
    await recordStockMovement(supabase, {
      itemKind: 'חומר_גלם',
      itemId: params.id,
      itemName: data.שם_חומר_גלם || prev.שם_חומר_גלם || '',
      before: Number(prev.כמות_במלאי) || 0,
      after: Number(data.כמות_במלאי) || 0,
      sourceKind: 'ידני',
      notes: 'עדכון מלאי ידני',
      createdBy: auth.email ?? null,
    });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('מלאי_חומרי_גלם').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
