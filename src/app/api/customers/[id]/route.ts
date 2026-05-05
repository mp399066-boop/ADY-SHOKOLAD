import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('לקוחות')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 });

  const [
    { data: orders },
    { data: invoices },
    { data: files },
    { data: communications },
  ] = await Promise.all([
    supabase.from('הזמנות').select('*').eq('לקוח_id', params.id).order('תאריך_יצירה', { ascending: false }),
    supabase.from('חשבוניות').select('*').eq('לקוח_id', params.id).order('תאריך_יצירה', { ascending: false }),
    supabase.from('uploaded_files').select('*').eq('entity_type', 'customer').eq('entity_id', params.id).order('uploaded_at', { ascending: false }),
    supabase.from('תיעוד_תקשורת').select('*').eq('לקוח_id', params.id).order('תאריך', { ascending: false }),
  ]);

  return NextResponse.json({
    data: {
      ...(data as object),
      הזמנות: orders || [],
      חשבוניות: invoices || [],
      קבצים: files || [],
      תיעוד_תקשורת: communications || [],
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('לקוחות')
    .update({ ...body, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { count } = await supabase
    .from('הזמנות')
    .select('*', { count: 'exact', head: true })
    .eq('לקוח_id', params.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'לא ניתן למחוק לקוח שיש לו הזמנות מקושרות' },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('לקוחות').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
