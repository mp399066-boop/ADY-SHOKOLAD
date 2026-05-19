export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// GET /api/analytics/finance?range=today|week|month|30days
// Read-only — returns aggregated revenue data. Never writes to DB.

type RangeKey = 'today' | 'week' | 'month' | '30days';
const VALID_RANGES: RangeKey[] = ['today', 'week', 'month', '30days'];

function todayJerusalem(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

function getDateRange(range: RangeKey, today: string): { from: string; to: string } {
  if (range === 'today') return { from: today, to: today };
  if (range === 'week')  return { from: addDaysISO(today, -6), to: today };
  if (range === 'month') {
    const [y, m] = today.split('-');
    return { from: `${y}-${m}-01`, to: today };
  }
  // 30days
  return { from: addDaysISO(today, -29), to: today };
}

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const { searchParams } = new URL(req.url);
  const rawRange = searchParams.get('range') ?? 'today';
  if (!VALID_RANGES.includes(rawRange as RangeKey)) {
    return NextResponse.json({ error: 'range לא תקין' }, { status: 400 });
  }

  const range = rawRange as RangeKey;
  const today = todayJerusalem();
  const { from, to } = getDateRange(range, today);
  const chartFrom = addDaysISO(today, -29);

  const supabase = createAdminClient();

  try {
    const [
      { data: paidRows,   error: e1 },
      { data: unpaidRows, count: unpaidCount, error: e2 },
      { data: chartRows,  error: e3 },
    ] = await Promise.all([
      // Paid orders in selected range — includes customer name for display
      supabase
        .from('הזמנות')
        .select('id, מספר_הזמנה, לקוח_id, סך_הכל_לתשלום, אופן_תשלום, סטטוס_הזמנה, תאריך_אספקה, לקוחות(שם_פרטי, שם_משפחה)')
        .eq('סטטוס_תשלום', 'שולם')
        .gte('תאריך_אספקה', from)
        .lte('תאריך_אספקה', to)
        .neq('סטטוס_הזמנה', 'בוטלה')
        .order('תאריך_אספקה', { ascending: false })
        .limit(200),

      // Current unpaid (not range-filtered — outstanding balance is always current)
      supabase
        .from('הזמנות')
        .select('סך_הכל_לתשלום', { count: 'exact' })
        .in('סטטוס_תשלום', ['ממתין', 'חלקי'])
        .neq('סטטוס_הזמנה', 'בוטלה')
        .neq('סטטוס_הזמנה', 'טיוטה')
        .neq('סטטוס_הזמנה', 'הושלמה בהצלחה'),

      // All paid in last 30 days — for the daily chart (always 30-day window)
      supabase
        .from('הזמנות')
        .select('תאריך_אספקה, סך_הכל_לתשלום')
        .eq('סטטוס_תשלום', 'שולם')
        .gte('תאריך_אספקה', chartFrom)
        .lte('תאריך_אספקה', today)
        .neq('סטטוס_הזמנה', 'בוטלה'),
    ]);

    const firstErr = e1 ?? e2 ?? e3;
    if (firstErr) {
      console.error('[analytics/finance]', firstErr.message);
      return NextResponse.json({ error: firstErr.message }, { status: 500 });
    }

    const paid   = (paidRows   ?? []) as Record<string, unknown>[];
    const unpaid = (unpaidRows ?? []) as Record<string, unknown>[];
    const chart  = (chartRows  ?? []) as Record<string, unknown>[];

    const paidTotal   = paid.reduce((s, r) => s + ((r['סך_הכל_לתשלום'] as number) ?? 0), 0);
    const unpaidTotal = unpaid.reduce((s, r) => s + ((r['סך_הכל_לתשלום'] as number) ?? 0), 0);

    // Build daily revenue map spanning last 30 days
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) dailyMap.set(addDaysISO(today, -29 + i), 0);
    for (const r of chart) {
      const d = r['תאריך_אספקה'] as string | null;
      if (d && dailyMap.has(d)) dailyMap.set(d, (dailyMap.get(d) ?? 0) + ((r['סך_הכל_לתשלום'] as number) ?? 0));
    }
    const dailyRevenue = Array.from(dailyMap.entries()).map(([date, amount]) => ({ date, amount }));

    // Payment method breakdown for selected range
    const methodMap = new Map<string, { count: number; amount: number }>();
    for (const r of paid) {
      const method = (r['אופן_תשלום'] as string | null) || 'לא צוין';
      const prev = methodMap.get(method) ?? { count: 0, amount: 0 };
      methodMap.set(method, { count: prev.count + 1, amount: prev.amount + ((r['סך_הכל_לתשלום'] as number) ?? 0) });
    }
    const byPaymentMethod = Array.from(methodMap.entries())
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // Top customers for selected range
    const custMap = new Map<string, { name: string; amount: number; count: number }>();
    for (const r of paid) {
      const cid = (r['לקוח_id'] as string) || 'unknown';
      const c = r['לקוחות'] as { שם_פרטי: string; שם_משפחה: string } | null;
      const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : '—';
      const prev = custMap.get(cid) ?? { name, amount: 0, count: 0 };
      custMap.set(cid, { name, amount: prev.amount + ((r['סך_הכל_לתשלום'] as number) ?? 0), count: prev.count + 1 });
    }
    const topCustomers = Array.from(custMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    // Paid orders list for selected range (up to 50)
    const orders = paid.slice(0, 50).map(r => {
      const c = r['לקוחות'] as { שם_פרטי: string; שם_משפחה: string } | null;
      return {
        id:            r['id'] as string,
        orderNumber:   r['מספר_הזמנה'] as string,
        customerName:  c ? `${c.שם_פרטי} ${c.שם_משפחה}` : '—',
        amount:        (r['סך_הכל_לתשלום'] as number | null) ?? 0,
        orderStatus:   r['סטטוס_הזמנה'] as string,
        date:          r['תאריך_אספקה'] as string | null,
        paymentMethod: (r['אופן_תשלום'] as string | null) ?? null,
      };
    });

    return NextResponse.json({
      range,
      dateFrom: from,
      dateTo:   to,
      paid:     { total: paidTotal,   count: paid.length },
      unpaid:   { total: unpaidTotal, count: unpaidCount ?? 0 },
      dailyRevenue,
      byPaymentMethod,
      topCustomers,
      orders,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'שגיאת שרת';
    console.error('[analytics/finance]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
