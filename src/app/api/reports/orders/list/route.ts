export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { fetchOrdersForReport, resolveRange, type ReportInput, type ReportFilters } from '@/lib/orders-report-email';

// POST /api/reports/orders/list
//
// Lightweight read-only projection of the same orders fetchOrdersForReport
// returns. Kept as a cheap list endpoint for report-related UI; it never
// writes to orders or changes delivery time.
const bodySchema = z.object({
  range: z.enum(['today', 'tomorrow', 'week', 'custom']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filters: z.object({
    urgentOnly: z.boolean().optional(),
    unpaidOnly: z.boolean().optional(),
    deliveryOnly: z.boolean().optional(),
    pickupOnly: z.boolean().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'נתונים לא תקינים' }, { status: 400 });
  }

  const { range, date, filters } = parsed.data;
  if (range === 'custom' && !date) {
    return NextResponse.json({ error: 'בטווח מותאם — חובה לבחור תאריך' }, { status: 400 });
  }
  if (filters?.deliveryOnly && filters?.pickupOnly) {
    return NextResponse.json({ error: 'לא ניתן לבחור גם משלוחים בלבד וגם איסוף בלבד' }, { status: 400 });
  }

  const input: ReportInput = { range, date, filters };
  const reportFilters: ReportFilters = filters ?? {};

  try {
    const { startDate, endDate, label } = resolveRange(input);
    const { orders } = await fetchOrdersForReport(startDate, endDate, reportFilters);

    type RawO = Record<string, unknown>;
    const list = orders.map(o => {
      const r = o as RawO;
      const cust = r['לקוחות'] as { שם_פרטי?: string; שם_משפחה?: string } | null;
      const customerName = cust ? `${cust.שם_פרטי || ''} ${cust.שם_משפחה || ''}`.trim() || 'ללא שם' : 'ללא שם';
      return {
        id: String(r.id),
        orderNumber: String(r['מספר_הזמנה'] || ''),
        customerName,
        deliveryDate: (r['תאריך_אספקה'] as string) || null,
        deliveryTime: (r['שעת_אספקה'] as string) || null,
        deliveryType: (r['סוג_אספקה'] as string) || null,
        urgent: !!r['הזמנה_דחופה'],
      };
    });

    return NextResponse.json({
      ok: true,
      rangeLabel: label,
      startDate,
      endDate,
      orders: list,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    console.error('[reports/orders/list] failed:', msg);
    return NextResponse.json({ error: `שגיאה בטעינת הזמנות: ${msg}` }, { status: 500 });
  }
}
