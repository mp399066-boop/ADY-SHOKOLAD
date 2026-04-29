export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

type OrderJoin = {
  שם_מקבל?: string | null;
  לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
};

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token) return NextResponse.json({ error: 'לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('משלוחים')
    .select('id, סטטוס_משלוח, כתובת, עיר, הזמנות(שם_מקבל, לקוחות(שם_פרטי, שם_משפחה))')
    .eq('delivery_token', params.token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 });
  }

  const order = data.הזמנות as OrderJoin | null;
  const שם_מקבל =
    order?.שם_מקבל ||
    (order?.לקוחות ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}` : null);

  return NextResponse.json({
    delivery: {
      שם_מקבל,
      כתובת: data.כתובת,
      עיר: data.עיר,
      סטטוס_משלוח: data.סטטוס_משלוח,
    },
  });
}

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token) return NextResponse.json({ error: 'לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from('משלוחים')
    .select('id, סטטוס_משלוח')
    .eq('delivery_token', params.token)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 });
  }

  if (existing.סטטוס_משלוח === 'נמסר') {
    return NextResponse.json({ error: 'המשלוח כבר סומן כנמסר', already: true }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from('משלוחים')
    .update({ סטטוס_משלוח: 'נמסר', delivered_at: new Date().toISOString() })
    .eq('id', existing.id);

  if (updateError) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ success: true });
}
