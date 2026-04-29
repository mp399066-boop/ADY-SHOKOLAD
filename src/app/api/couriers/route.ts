export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('שליחים')
    .select('*, משלוחים!courier_id(סטטוס_משלוח)')
    .order('שם_שליח', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data || []).map((courier: Record<string, unknown>) => {
    const deliveries = (courier.משלוחים as { סטטוס_משלוח: string }[]) || [];
    return {
      ...courier,
      משלוחים: undefined,
      stats: {
        ממתין: deliveries.filter(d => d.סטטוס_משלוח === 'ממתין').length,
        נאסף:  deliveries.filter(d => d.סטטוס_משלוח === 'נאסף').length,
        נמסר:  deliveries.filter(d => d.סטטוס_משלוח === 'נמסר').length,
        total: deliveries.length,
      },
    };
  });

  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.שם_שליח?.trim()) {
    return NextResponse.json({ error: 'שם שליח הוא שדה חובה' }, { status: 400 });
  }
  if (!body.טלפון_שליח?.trim() && !body.אימייל_שליח?.trim()) {
    return NextResponse.json({ error: 'חובה להזין טלפון או אימייל לשליח' }, { status: 400 });
  }

  const insertPayload: Record<string, unknown> = {
    שם_שליח:    body.שם_שליח.trim(),
    טלפון_שליח: body.טלפון_שליח?.trim() || '',
    הערות:       body.הערות || null,
    פעיל:        body.פעיל !== false,
  };
  // אימייל_שליח added by migration 008 — include only when provided to avoid schema error if column missing
  if (body.אימייל_שליח?.trim()) {
    insertPayload.אימייל_שליח = body.אימייל_שליח.trim();
  }

  console.log('[couriers POST] inserting:', JSON.stringify(insertPayload));
  const { data, error } = await supabase
    .from('שליחים')
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    console.error('[couriers POST] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
