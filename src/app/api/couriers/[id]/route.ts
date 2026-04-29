import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const body = await req.json();

  // Build update payload with only safe base columns
  const updatePayload: Record<string, unknown> = {
    שם_שליח:    body.שם_שליח,
    טלפון_שליח: body.טלפון_שליח,
    הערות:       body.הערות ?? null,
    פעיל:        body.פעיל,
    updated_at:  new Date().toISOString(),
  };
  // Remove undefined fields (not provided in body)
  for (const key of Object.keys(updatePayload)) {
    if (updatePayload[key] === undefined) delete updatePayload[key];
  }
  // אימייל_שליח: include only if explicitly provided (requires migration 008)
  if ('אימייל_שליח' in body) {
    updatePayload.אימייל_שליח = body.אימייל_שליח?.trim() || null;
  }

  console.log('[couriers PATCH] id:', params.id, '| payload keys:', Object.keys(updatePayload));
  const { data, error } = await supabase
    .from('שליחים')
    .update(updatePayload)
    .eq('id', params.id)
    .select()
    .single();
  if (error) {
    console.error('[couriers PATCH] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('שליחים')
    .update({ פעיל: false, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
