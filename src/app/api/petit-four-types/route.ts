export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('סוגי_פטיפורים').select('*').eq('פעיל', true).order('שם_פטיפור');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.שם_פטיפור) return NextResponse.json({ error: 'שם הפטיפור הוא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase
    .from('סוגי_פטיפורים')
    .insert({ ...body, מזהה_לובהבל: crypto.randomUUID() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
