export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { orderProfit, profitMargin } from '@/lib/order-profit';
import { loadUnitCosts, PROFIT_ORDER_SELECT, profitInput } from '@/lib/profit-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/orders/[id]/profit — cost & profit of one order (admin only).
export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה הזמנה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const [{ costs, tableReady, error: costErr }, { data: row, error }] = await Promise.all([
    loadUnitCosts(supabase),
    supabase.from('הזמנות').select(PROFIT_ORDER_SELECT).eq('id', id).maybeSingle(),
  ]);
  if (costErr) return dbErrorResponse(costErr, 'orders/[id]/profit costs');
  if (error) return dbErrorResponse(error, 'orders/[id]/profit');
  if (!row) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { order, lines } = profitInput(row);
  const p = orderProfit(order.barter ? 0 : order.netNoShipping, lines, costs);
  return NextResponse.json({
    tableReady,
    barter: order.barter,
    vatMode: order.vatMode,
    ...p,
    margin: profitMargin(p.profit, p.revenue),
  });
}
