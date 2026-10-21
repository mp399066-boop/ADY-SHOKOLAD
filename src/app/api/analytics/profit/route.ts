export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isCountableOrder, round2 } from '@/lib/finance';
import { orderProfit, aggregateByProduct, profitMargin, type MissingReason } from '@/lib/order-profit';
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
  const missingCount = new Map<string, { reason: MissingReason; orders: number }>();
  type PayAcc = { method: string; orders: number; incomplete: number; revenue: number; coveredRevenue: number; cost: number };
  const byPay = new Map<string, PayAcc>();
  for (const row of rows) {
    const { order, lines } = profitInput(row);
    if (!isCountableOrder({ סטטוס_הזמנה: (row as { סטטוס_הזמנה: string }).סטטוס_הזמנה, סטטוס_תשלום: order.paymentStatus })) continue;
    const p = orderProfit(order.barter ? 0 : order.netNoShipping, lines, costs);
    if (order.barter) {
      barterCount++;
      barterCost += p.cost;
    } else {
      profits.push(p);
      const method = order.paymentMethod?.trim() || 'לא צוין';
      let a = byPay.get(method);
      if (!a) { a = { method, orders: 0, incomplete: 0, revenue: 0, coveredRevenue: 0, cost: 0 }; byPay.set(method, a); }
      a.orders++;
      if (!p.complete) a.incomplete++;
      a.revenue += p.revenue;
      a.coveredRevenue += p.coveredRevenue;
      a.cost += p.cost;
    }
    for (const m of p.missingDetails) {
      const e = missingCount.get(m.label);
      if (e) e.orders++;
      else missingCount.set(m.label, { reason: m.reason, orders: 1 });
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
  const missingItems = [...missingCount.entries()]
    .map(([label, m]) => ({ label, reason: m.reason, orders: m.orders }))
    .sort((a, b) => b.orders - a.orders);

  // Same totals split by payment method (barter excluded, like the totals).
  const paymentMethods = [...byPay.values()].map(a => {
    const profit = round2(a.coveredRevenue - a.cost);
    return {
      method: a.method,
      orders: a.orders,
      incomplete: a.incomplete,
      revenue: round2(a.revenue),
      cost: round2(a.cost),
      profit,
      margin: profitMargin(profit, a.coveredRevenue),
      share: revenue > 0 ? Math.round((a.revenue / revenue) * 1000) / 10 : null,
    };
  }).sort((x, y) => y.revenue - x.revenue);

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
    paymentMethods,
    missingItems,
  });
}
