export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { generateOrderNumber } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    let query = supabase
      .from('הזמנות')
      .select('*, לקוחות(שם_פרטי, שם_משפחה, טלפון)', { count: 'exact' })
      .order('תאריך_יצירה', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter === 'archive') {
      // Archive: only completed / archived orders
      query = query.eq('סטטוס_הזמנה', 'הושלמה בהצלחה');
    } else if (filter === 'drafts') {
      query = query.eq('סטטוס_הזמנה', 'טיוטה');
    } else {
      // All other views: exclude completed/archived orders AND drafts
      query = query.neq('סטטוס_הזמנה', 'הושלמה בהצלחה').neq('סטטוס_הזמנה', 'טיוטה');
      if (filter === 'today') query = query.eq('תאריך_אספקה', today);
      else if (filter === 'tomorrow') query = query.eq('תאריך_אספקה', tomorrow);
      else if (filter === 'urgent') query = query.eq('הזמנה_דחופה', true).neq('סטטוס_הזמנה', 'בוטלה');
      // "Unpaid" = pay status in (ממתין, חלקי). Order-level draft/completed
       // exclusions already applied above; we only add the cancelled guard.
       // Must stay in lock-step with the dashboard's unpaid count.
      else if (filter === 'unpaid') query = query.in('סטטוס_תשלום', ['ממתין', 'חלקי']).neq('סטטוס_הזמנה', 'בוטלה');
      else if (filter === 'preparation') query = query.eq('סטטוס_הזמנה', 'בהכנה');
      else if (filter === 'ready') query = query.eq('סטטוס_הזמנה', 'מוכנה למשלוח');
      else if (filter === 'shipped') query = query.eq('סטטוס_הזמנה', 'נשלחה');
    }

    if (search) {
      query = query.or(`מספר_הזמנה.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data, count });
  } catch (err: any) {
    console.error('[orders] unexpected error:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'שגיאת שרת' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  const order = {
    מספר_הזמנה: body.מספר_הזמנה || generateOrderNumber(),
    לקוח_id: body.לקוח_id,
    סטטוס_הזמנה: body.סטטוס_הזמנה || 'חדשה',
    הזמנה_דחופה: body.הזמנה_דחופה || false,
    תאריך_הזמנה: body.תאריך_הזמנה || new Date().toISOString().split('T')[0],
    תאריך_אספקה: body.תאריך_אספקה || null,
    שעת_אספקה: body.שעת_אספקה || null,
    סוג_אספקה: body.סוג_אספקה || 'איסוף עצמי',
    שם_מקבל: body.שם_מקבל || null,
    טלפון_מקבל: body.טלפון_מקבל || null,
    כתובת_מקבל_ההזמנה: body.כתובת_מקבל_ההזמנה || null,
    עיר: body.עיר || null,
    הוראות_משלוח: body.הוראות_משלוח || null,
    דמי_משלוח: body.דמי_משלוח || 0,
    אופן_תשלום: body.אופן_תשלום || null,
    סטטוס_תשלום: body.סטטוס_תשלום || 'ממתין',
    סכום_לפני_הנחה: body.סכום_לפני_הנחה || 0,
    סכום_הנחה: body.סכום_הנחה || 0,
    סך_הכל_לתשלום: body.סך_הכל_לתשלום || 0,
    מקור_ההזמנה: body.מקור_ההזמנה || null,
    ברכה_טקסט: body.ברכה_טקסט || null,
    הערות_להזמנה: body.הערות_להזמנה || null,
  };

  if (!order.לקוח_id) {
    return NextResponse.json({ error: 'לקוח הוא שדה חובה' }, { status: 400 });
  }

  const { data, error } = await supabase.from('הזמנות').insert(order).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
