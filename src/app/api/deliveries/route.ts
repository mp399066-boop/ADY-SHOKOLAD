export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

interface OrderRow {
  id: string;
  מספר_הזמנה: string;
  שם_מקבל: string | null;
  טלפון_מקבל: string | null;
  לקוח_id: string;
  תאריך_אספקה: string | null;
  שעת_אספקה: string | null;
  כתובת_מקבל_ההזמנה: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  דמי_משלוח: number | null;
  לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
}

interface DeliveryRow {
  id: string;
  הזמנה_id: string;
  סטטוס_משלוח: string;
  תאריך_משלוח: string | null;
  שעת_משלוח: string | null;
  כתובת: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  שם_שליח: string | null;
  טלפון_שליח: string | null;
  הערות: string | null;
  courier_id: string | null;
  delivery_token: string | null;
  delivered_at: string | null;
  whatsapp_sent_at: string | null;
  שליחים?: { id: string; שם_שליח: string; טלפון_שליח: string } | null;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const date   = searchParams.get('date');
  const status = searchParams.get('status');
  const mode   = searchParams.get('mode');

  // ── Archive mode: query משלוחים directly for נמסר ──────────────────────────
  if (mode === 'archive') {
    const { data, error } = await supabase
      .from('משלוחים')
      .select(`
        id, הזמנה_id, סטטוס_משלוח, כתובת, עיר,
        delivered_at, courier_id, delivery_token,
        הזמנות(id, מספר_הזמנה, שם_מקבל, לקוח_id, לקוחות(שם_פרטי, שם_משפחה)),
        שליחים!courier_id(שם_שליח)
      `)
      .eq('סטטוס_משלוח', 'נמסר')
      .order('delivered_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  }

  // Fetch all orders that are deliveries:
  // either marked סוג_אספקה='משלוח', OR have a delivery address, OR have delivery fee > 0
  let ordersQuery = supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, שם_מקבל, טלפון_מקבל, לקוח_id, תאריך_אספקה, שעת_אספקה, כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח, דמי_משלוח, לקוחות(שם_פרטי, שם_משפחה)')
    .or('סוג_אספקה.eq.משלוח,כתובת_מקבל_ההזמנה.not.is.null,דמי_משלוח.gt.0')
    .neq('סטטוס_הזמנה', 'הושלמה בהצלחה')
    .neq('סטטוס_הזמנה', 'בוטלה')
    .order('תאריך_אספקה', { ascending: true });

  // date filter only when explicitly provided — no default
  if (date) ordersQuery = ordersQuery.eq('תאריך_אספקה', date);

  const { data: ordersRaw, error: ordersError } = await ordersQuery;
  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

  const orders = (ordersRaw || []) as OrderRow[];
  if (orders.length === 0) return NextResponse.json({ data: [] });

  const orderIds = orders.map(o => o.id);

  // Fetch existing delivery records for these orders (with courier join)
  const { data: deliveriesRaw, error: deliveriesError } = await supabase
    .from('משלוחים')
    .select('*, שליחים!courier_id(id, שם_שליח, טלפון_שליח)')
    .in('הזמנה_id', orderIds);

  if (deliveriesError) return NextResponse.json({ error: deliveriesError.message }, { status: 500 });

  const deliveries = (deliveriesRaw || []) as DeliveryRow[];

  // Map deliveries by order ID (one delivery per order assumed)
  const deliveryByOrder = new Map(deliveries.map(d => [d.הזמנה_id, d]));

  // Build combined result: orders with delivery record get full record; orders without get synthetic row
  const combined = orders
    .map(order => {
      const delivery = deliveryByOrder.get(order.id);
      if (delivery) {
        return { ...delivery, הזמנות: order };
      }
      return {
        _noRecord: true,
        id: `no-record-${order.id}`,
        הזמנה_id: order.id,
        סטטוס_משלוח: 'ממתין',
        תאריך_משלוח: order.תאריך_אספקה || null,
        שעת_משלוח: order.שעת_אספקה || null,
        כתובת: order.כתובת_מקבל_ההזמנה || null,
        עיר: order.עיר || null,
        הוראות_משלוח: order.הוראות_משלוח || null,
        שם_שליח: null,
        טלפון_שליח: null,
        הערות: null,
        courier_id: null,
        delivery_token: null,
        delivered_at: null,
        whatsapp_sent_at: null,
        שליחים: null,
        הזמנות: order,
      };
    })
    .filter(row => !status || row.סטטוס_משלוח === status);

  return NextResponse.json({ data: combined });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.הזמנה_id) return NextResponse.json({ error: 'הזמנה היא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase.from('משלוחים').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
