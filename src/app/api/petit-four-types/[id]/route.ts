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

  const { data: prev } = await supabase
    .from('סוגי_פטיפורים')
    .select('שם_פטיפור, כמות_במלאי')
    .eq('id', params.id)
    .single();

  const { data, error } = await supabase
    .from('סוגי_פטיפורים')
    .update({ ...body, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    const msg = error.message?.includes('column') && error.message?.includes('not found')
      ? 'עמודת המלאי לא קיימת — הרץ את migration 002 בסופרבייס SQL Editor'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
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

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('סוגי_פטיפורים').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
