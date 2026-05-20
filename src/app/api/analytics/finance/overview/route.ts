export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// GET /api/analytics/finance/overview
// Read-only — returns all KPI periods + charts + lists in one call. Never writes to DB.

function todayJerusalem(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function monthKeyAgo(today: string, monthsAgo: number): string {
  const [y, m] = today.split('-').map(Number);
  let year = y; let month = m - monthsAgo;
  while (month <= 0) { month += 12; year--; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function shortMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('he-IL', { month: 'short' });
}

type PaidRow = Record<string, unknown>;

// ── Paginated fetch helper ──────────────────────────────────────────────────
// Supabase / PostgREST caps a single GET at db.max_rows (1000 by default).
// Previous code used `.limit(2000)` / `.limit(200)` which silently truncated
// once the business grew past those thresholds:
//   • paid 365d capped at 2000 → year KPIs, monthly chart, top-customers,
//     payment-methods all silently undercounted past ~5.5 paid orders/day
//   • unpaid capped at 200 → the unpaid amount KPI's count was right (via
//     count:exact) but the sum it displayed was only over the top-200 rows
// Solution: page through with .range() until a short page comes back. We
// only request the columns we actually need, so each page is small.
async function fetchAllPaged<T = PaidRow>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // Hard ceiling guards against accidental infinite loops if the data set
  // were to explode. 200k paid rows / year is far past any realistic volume.
  const maxRows = 200_000;
  while (offset < maxRows) {
    const { data, error } = await build(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

const getKpi = (rows: PaidRow[], fromDate: string, toDate: string) => {
  const r = rows.filter(o => {
    const d = o['תאריך_אספקה'] as string | null;
    return d && d >= fromDate && d <= toDate;
  });
  return {
    total: r.reduce((s, o) => s + ((o['סך_הכל_לתשלום'] as number) ?? 0), 0),
    count: r.length,
  };
};

const toOrderRow = (r: PaidRow) => {
  const c = r['לקוחות'] as { שם_פרטי: string; שם_משפחה: string } | null;
  return {
    id:            r['id'] as string,
    orderNumber:   r['מספר_הזמנה'] as string,
    customerName:  c ? `${c.שם_פרטי} ${c.שם_משפחה}`.trim() : '—',
    amount:        (r['סך_הכל_לתשלום'] as number | null) ?? 0,
    orderStatus:   (r['סטטוס_הזמנה'] as string | null) ?? '',
    date:          r['תאריך_אספקה'] as string | null,
    paymentMethod: (r['אופן_תשלום'] as string | null) ?? null,
  };
};

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const today  = todayJerusalem();
  const from365 = addDaysISO(today, -364);
  const from30  = addDaysISO(today, -29);

  const [ty, tm] = today.split('-');
  const weekFrom  = addDaysISO(today, -6);
  const monthFrom = `${ty}-${tm}-01`;
  const yearFrom  = `${ty}-01-01`;

  try {
    // Paid + unpaid are fetched via paginated helpers so the KPIs/charts
    // below are computed over the FULL data set, not a truncated slice.
    const [paid, unpaid] = await Promise.all([
      fetchAllPaged<PaidRow>((from, to) =>
        supabase
          .from('הזמנות')
          .select('id, מספר_הזמנה, לקוח_id, סך_הכל_לתשלום, אופן_תשלום, סטטוס_הזמנה, תאריך_אספקה, לקוחות(שם_פרטי, שם_משפחה)')
          .eq('סטטוס_תשלום', 'שולם')
          .gte('תאריך_אספקה', from365)
          .lte('תאריך_אספקה', today)
          .neq('סטטוס_הזמנה', 'בוטלה')
          .order('תאריך_אספקה', { ascending: false })
          .range(from, to),
      ),
      fetchAllPaged<PaidRow>((from, to) =>
        supabase
          .from('הזמנות')
          .select('id, מספר_הזמנה, לקוח_id, סך_הכל_לתשלום, סטטוס_הזמנה, תאריך_אספקה, לקוחות(שם_פרטי, שם_משפחה)')
          .in('סטטוס_תשלום', ['ממתין', 'חלקי'])
          .neq('סטטוס_הזמנה', 'בוטלה')
          .neq('סטטוס_הזמנה', 'טיוטה')
          .neq('סטטוס_הזמנה', 'הושלמה בהצלחה')
          .order('סך_הכל_לתשלום', { ascending: false })
          .range(from, to),
      ),
    ]);
    // Count derives directly from the paginated array → exact, no separate
    // count:exact query needed and no risk of count/sum disagreement.
    const unpaidCount = unpaid.length;

    const kpis = {
      today:  getKpi(paid, today,     today),
      week:   getKpi(paid, weekFrom,  today),
      month:  getKpi(paid, monthFrom, today),
      year:   getKpi(paid, yearFrom,  today),
      unpaid: {
        total: unpaid.reduce((s, o) => s + ((o['סך_הכל_לתשלום'] as number) ?? 0), 0),
        count: unpaidCount ?? 0,
      },
    };

    // Daily chart — last 30 days
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) dailyMap.set(addDaysISO(today, -29 + i), 0);
    for (const r of paid) {
      const d = r['תאריך_אספקה'] as string | null;
      if (d && dailyMap.has(d)) dailyMap.set(d, (dailyMap.get(d) ?? 0) + ((r['סך_הכל_לתשלום'] as number) ?? 0));
    }
    const dailyChart = Array.from(dailyMap.entries()).map(([key, amount]) => ({
      key, label: key.slice(5).replace('-', '/'), amount,
    }));

    // Monthly chart — last 12 months
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) monthKeys.push(monthKeyAgo(today, i));
    const monthlyMap = new Map<string, number>();
    for (const k of monthKeys) monthlyMap.set(k, 0);
    for (const r of paid) {
      const d = r['תאריך_אספקה'] as string | null;
      if (d) {
        const mk = d.slice(0, 7);
        if (monthlyMap.has(mk)) monthlyMap.set(mk, (monthlyMap.get(mk) ?? 0) + ((r['סך_הכל_לתשלום'] as number) ?? 0));
      }
    }
    const monthlyChart = monthKeys.map(key => ({
      key, label: shortMonthLabel(key), amount: monthlyMap.get(key) ?? 0,
    }));

    // Payment methods — last 30 days
    const paid30 = paid.filter(r => {
      const d = r['תאריך_אספקה'] as string | null;
      return d && d >= from30 && d <= today;
    });
    const methodMap = new Map<string, { count: number; amount: number }>();
    for (const r of paid30) {
      const method = (r['אופן_תשלום'] as string | null) || 'לא צוין';
      const prev = methodMap.get(method) ?? { count: 0, amount: 0 };
      methodMap.set(method, { count: prev.count + 1, amount: prev.amount + ((r['סך_הכל_לתשלום'] as number) ?? 0) });
    }
    const byPaymentMethod = Array.from(methodMap.entries())
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // Top customers — last 12 months (all of paid)
    const custMap = new Map<string, { name: string; amount: number; count: number }>();
    for (const r of paid) {
      const cid = (r['לקוח_id'] as string) || 'unknown';
      const c   = r['לקוחות'] as { שם_פרטי: string; שם_משפחה: string } | null;
      const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}`.trim() : '—';
      const prev = custMap.get(cid) ?? { name, amount: 0, count: 0 };
      custMap.set(cid, { name, amount: prev.amount + ((r['סך_הכל_לתשלום'] as number) ?? 0), count: prev.count + 1 });
    }
    const topCustomers = Array.from(custMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    // High-value paid orders — top 8 by amount, last 12 months
    const highValueOrders = [...paid]
      .sort((a, b) => ((b['סך_הכל_לתשלום'] as number) ?? 0) - ((a['סך_הכל_לתשלום'] as number) ?? 0))
      .slice(0, 8)
      .map(toOrderRow);

    // Recently paid — top 12 sorted by date desc (already sorted)
    const recentPaid = paid.slice(0, 12).map(toOrderRow);

    // Open orders for collection — top 12 by amount desc (already sorted)
    const openOrders = unpaid.slice(0, 12).map(toOrderRow);

    return NextResponse.json({
      kpis,
      dailyChart,
      monthlyChart,
      byPaymentMethod,
      topCustomers,
      highValueOrders,
      recentPaid,
      openOrders,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'שגיאת שרת';
    console.error('[analytics/finance/overview]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
