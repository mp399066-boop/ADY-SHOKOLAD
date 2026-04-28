export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const status = searchParams.get('status');

  let query = supabase
    .from('משלוחים')
    .select('*, הזמנות(מספר_הזמנה, שם_מקבל, תאריך_אספקה, לקוחות(שם_פרטי, שם_משפחה))')
    .order('תאריך_משלוח');

  if (date) query = query.eq('תאריך_משלוח', date);
  if (status) query = query.eq('סטטוס_משלוח', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.הזמנה_id) return NextResponse.json({ error: 'הזמנה היא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase.from('משלוחים').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
