export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isCountableOrder, round2 } from '@/lib/finance';
import { orderProfit, aggregateByProduct, profitMargin } from '@/lib/order-profit';
import { loadUnitCosts, PROFIT_ORDER_SELECT, profitInput } from '@/lib/profit-server';

// GET /api/analytics/profit?from=YYYY-MM-DD&to=YYYY-MM-DD&basis=delivery|order
// Read-only. Profit per order and per product for a date range (admin only —
// costs and margins are the owner's data, like /costs and /finance).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const sp = new URL(req.url).searchParams;
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  const basis = sp.get('basis') === 'order' ? 'order' : 'delivery';
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    return NextResponse.json({ error: 'טווח תאריכים לא תקין' }, { status: 400 });
  }
  const dateCol = basis === 'order' ? 'תאריך_הזמנה' : 'תאריך_אספקה';

  const supabase = createAdminClient();
  const { costs, tableReady, error: costErr } = await loadUnitCosts(supabase);
  if (costErr) return dbErrorResponse(costErr, 'analytics/profit costs');

  const { data: rows, error } = await fetchAllPages((a, b) => supabase
    .from('הזמנות')
    .select(PROFIT_ORDER_SELECT)
    .gte(dateCol, from)
    .lte(dateCol, to)
    .not('סטטוס_הזמנה', 'in', '("בוטלה","טיוטה")')
    .order('id')
    .range(a, b));
  if (error) return dbErrorResponse(error, 'analytics/profit');

  const orders = [];
  const profits = [];
  let barterCount = 0;
  let barterCost = 0;
  for (const row of rows) {
    const { order, lines } = profitInput(row);
    if (!isCountableOrder({ סטטוס_הזמנה: (row as { סטטוס_הזמנה: string }).סטטוס_הזמנה, סטטוס_תשלום: order.paymentStatus })) continue;
    const p = orderProfit(order.barter ? 0 : order.netNoShipping, lines, costs);
    if (order.barter) {
      barterCount++;
      barterCost += p.cost;
    } else {
      profits.push(p);
    }
    orders.push({
      id: order.id,
      orderNumber: order.orderNumber,
      date: basis === 'order' ? order.orderDate : order.deliveryDate,
      customerName: order.customerName,
      barter: order.barter,
      revenue: p.revenue,
      cost: p.cost,
      profit: p.profit,
      partialProfit: p.partialProfit,
      coveredRevenue: p.coveredRevenue,
      margin: profitMargin(p.profit, p.revenue),
      complete: p.complete,
      missing: p.missing,
    });
  }
  orders.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));

  const revenue = round2(profits.reduce((s, p) => s + p.revenue, 0));
  const cost = round2(profits.reduce((s, p) => s + p.cost, 0));
  const coveredRevenue = round2(profits.reduce((s, p) => s + p.coveredRevenue, 0));
  const profitOnCovered = round2(coveredRevenue - cost);

  // Items sold with no cost, most frequent first — what to fill in on /costs.
  const missingCount = new Map<string, number>();
  for (const o of orders) for (const m of o.missing) missingCount.set(m, (missingCount.get(m) ?? 0) + 1);
  const missingItems = [...missingCount.entries()]
    .map(([label, count]) => ({ label, orders: count }))
    .sort((a, b) => b.orders - a.orders);

  return NextResponse.json({
    tableReady,
    from, to, basis,
    totals: {
      orders: profits.length,
      completeOrders: profits.filter(p => p.complete).length,
      revenue,
      cost,
      coveredRevenue,
      profitOnCovered,
      margin: profitMargin(profitOnCovered, coveredRevenue),
      coverage: revenue > 0 ? Math.round((coveredRevenue / revenue) * 1000) / 10 : null,
      barterOrders: barterCount,
      barterCost: round2(barterCost),
    },
    products: aggregateByProduct(profits),
    orders,
    missingItems,
  });
}
