export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('תיעוד_תקשורת')
    .select('*')
    .eq('לקוח_id', params.id)
    .order('תאריך', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.תוכן) return NextResponse.json({ error: 'תוכן הוא שדה חובה' }, { status: 400 });
  if (!['מייל', 'וואטסאפ'].includes(body.סוג)) {
    return NextResponse.json({ error: 'סוג לא תקין' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('תיעוד_תקשורת')
    .insert({
      לקוח_id: params.id,
      סוג: body.סוג,
      תוכן: body.תוכן,
      תאריך: body.תאריך || new Date().toISOString(),
      כיוון: body.כיוון || 'יוצא',
      נושא: body.נושא || null,
      אל: body.אל || null,
      מ: body.מ || null,
      סטטוס: body.סטטוס || 'נשלח',
      הודעת_שגיאה: body.הודעת_שגיאה || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
