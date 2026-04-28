export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const type = searchParams.get('type');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('לקוחות')
    .select('*', { count: 'exact' })
    .order('תאריך_יצירה', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`שם_פרטי.ilike.%${search}%,שם_משפחה.ilike.%${search}%,טלפון.ilike.%${search}%,אימייל.ilike.%${search}%`);
  }
  if (type) {
    query = query.eq('סוג_לקוח', type);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  const customer = {
    שם_פרטי: body.שם_פרטי,
    שם_משפחה: body.שם_משפחה || '',
    טלפון: body.טלפון || null,
    אימייל: body.אימייל || null,
    סוג_לקוח: body.סוג_לקוח || 'פרטי',
    סטטוס_לקוח: body.סטטוס_לקוח || 'פעיל',
    מקור_הגעה: body.מקור_הגעה || null,
    אחוז_הנחה: body.אחוז_הנחה || 0,
    הערות: body.הערות || null,
  };

  if (!customer.שם_פרטי) {
    return NextResponse.json({ error: 'שם פרטי הוא שדה חובה' }, { status: 400 });
  }

  const { data, error } = await supabase.from('לקוחות').insert(customer).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
