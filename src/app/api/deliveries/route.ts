export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

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
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
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

  // ── Active deliveries (ממתין / נאסף) ────────────────────────────────────
  //
  // Previously this branch led with an ORDERS query filtered by
  // `.or('סוג_אספקה.eq.משלוח, …')`. If an order didn't pass that .or()
  // filter (e.g. סוג_אספקה wasn't exactly 'משלוח' and no address/fee was
  // set), its delivery row was invisible even when it actually existed.
  // That caused freshly-assigned deliveries to "vanish" after the
  // dashboard's "שייך שליח" flow.
  //
  // The fix: the active list is built from two sources, then merged:
  //   A. ANY משלוחים row whose סטטוס != 'נמסר' (with the linked order
  //      excluded only when its סטטוס_הזמנה is בוטלה — cancelled orders
  //      live in the orders archive, not the deliveries list).
  //   B. Synthetic placeholders for orders that LOOK like deliveries but
  //      have no row yet (so the operator can still pick them up from
  //      the dashboard / deliveries page and start a delivery).
  //
  // Source A guarantees: if the row exists with a non-נמסר status, it
  // shows up regardless of the order's סוג_אספקה.

  // ── A. Real delivery rows (active) ───────────────────────────────────────
  let activeDeliveriesQuery = supabase
    .from('משלוחים')
    .select(`
      *,
      שליחים!courier_id(id, שם_שליח, טלפון_שליח),
      הזמנות!inner(id, מספר_הזמנה, שם_מקבל, טלפון_מקבל, לקוח_id, תאריך_אספקה, שעת_אספקה, כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח, דמי_משלוח, סטטוס_הזמנה, לקוחות(שם_פרטי, שם_משפחה))
    `)
    .neq('סטטוס_משלוח', 'נמסר')
    .neq('הזמנות.סטטוס_הזמנה', 'בוטלה')
    .order('תאריך_משלוח', { ascending: true });
  if (date) activeDeliveriesQuery = activeDeliveriesQuery.eq('תאריך_משלוח', date);

  const { data: activeDeliveriesRaw, error: activeErr } = await activeDeliveriesQuery;
  if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });

  type ActiveDeliveryRaw = DeliveryRow & { הזמנות?: OrderRow & { סטטוס_הזמנה?: string } | null };
  const activeDeliveries = ((activeDeliveriesRaw || []) as unknown as ActiveDeliveryRaw[])
    // Defensive: the !inner() join is supposed to drop rows where the order
    // is missing, but a stale row whose order was deleted would otherwise
    // crash downstream. Skip silently.
    .filter(d => d.הזמנות != null);

  // ── B. Orders that qualify as deliveries but have no row yet ────────────
  let placeholderOrdersQuery = supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, שם_מקבל, טלפון_מקבל, לקוח_id, תאריך_אספקה, שעת_אספקה, כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח, דמי_משלוח, לקוחות(שם_פרטי, שם_משפחה)')
    .or('סוג_אספקה.eq.משלוח,כתובת_מקבל_ההזמנה.not.is.null,דמי_משלוח.gt.0')
    .neq('סטטוס_הזמנה', 'הושלמה בהצלחה')
    .neq('סטטוס_הזמנה', 'בוטלה')
    .order('תאריך_אספקה', { ascending: true });
  if (date) placeholderOrdersQuery = placeholderOrdersQuery.eq('תאריך_אספקה', date);

  const { data: placeholderOrdersRaw, error: placeholderErr } = await placeholderOrdersQuery;
  if (placeholderErr) return NextResponse.json({ error: placeholderErr.message }, { status: 500 });
  const placeholderOrders = (placeholderOrdersRaw || []) as OrderRow[];

  // Drop any order that already has an active delivery row (we'll show the
  // real row instead of a synthetic placeholder).
  const orderIdsWithActiveRow = new Set(activeDeliveries.map(d => d.הזמנה_id));

  const synthetic = placeholderOrders
    .filter(o => !orderIdsWithActiveRow.has(o.id))
    .map(order => ({
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
    }));

  // Merge + apply optional explicit status filter (Select dropdown). Real
  // rows come first since they carry actionable state.
  const combined = [...activeDeliveries, ...synthetic]
    .filter(row => !status || row.סטטוס_משלוח === status);

  return NextResponse.json({ data: combined });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.הזמנה_id) return NextResponse.json({ error: 'הזמנה היא שדה חובה' }, { status: 400 });
  const { data, error } = await supabase.from('משלוחים').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
