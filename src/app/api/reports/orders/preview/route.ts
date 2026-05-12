export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { fetchOrdersForReport, resolveRange, type ReportInput, type ReportFilters } from '@/lib/orders-report-email';

// POST /api/reports/orders/preview
//
// Read-only — returns the same numbers + first-5-rows that the actual
// report uses, so the user can see what's about to be downloaded/sent
// before committing. Uses the existing fetchOrdersForReport / resolveRange
// helpers (zero logic duplication; the preview and the real report cannot
// drift apart).
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

const SAMPLE_LIMIT = 5;

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
    const { orders, summary } = await fetchOrdersForReport(startDate, endDate, reportFilters);

    // Compute totals from the orders we already fetched — same source the
    // real report uses, no additional query.
    const totalAmount = orders.reduce(
      (sum, o) => sum + Number((o as Record<string, unknown>).סך_הכל_לתשלום || 0),
      0,
    );

    // First N orders, projected to the minimal shape the UI needs to
    // render a quick-look table.
    type RawO = Record<string, unknown>;
    const sample = orders.slice(0, SAMPLE_LIMIT).map(o => {
      const r = o as RawO;
      const cust = r['לקוחות'] as { שם_פרטי?: string; שם_משפחה?: string } | null;
      const fullName = cust ? `${cust.שם_פרטי || ''} ${cust.שם_משפחה || ''}`.trim() : '—';
      return {
        id: String(r.id),
        orderNumber: String(r['מספר_הזמנה'] || ''),
        customerName: fullName,
        deliveryDate: (r['תאריך_אספקה'] as string) || null,
        deliveryTime: (r['שעת_אספקה'] as string) || null,
        deliveryType: (r['סוג_אספקה'] as string) || null,
        paymentStatus: (r['סטטוס_תשלום'] as string) || null,
        urgent: !!r['הזמנה_דחופה'],
        total: Number(r['סך_הכל_לתשלום'] || 0),
      };
    });

    return NextResponse.json({
      ok: true,
      summary: {
        ...summary,
        rangeLabel: label,
        startDate,
        endDate,
        totalAmount,
        sampleSize: sample.length,
        truncated: orders.length > SAMPLE_LIMIT,
      },
      sample,
      // Echo the input so the caller can post the same payload back to
      // /download or /send without re-deriving anything.
      query: { range, date, filters: filters ?? {} },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    console.error('[reports/orders/preview] failed:', msg);
    return NextResponse.json({ error: `שגיאה בהכנת תצוגה: ${msg}` }, { status: 500 });
  }
}
