export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { fetchOrdersForReport, resolveRange, buildReportHtml, type ReportInput, type ReportFilters, type ReportSummary } from '@/lib/orders-report-email';

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
  // Optional free-text note rendered above the order cards. Capped at a
  // generous length so a runaway paste can't blow up the email body.
  note: z.string().max(2000).optional(),
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

  const { range, date, filters, note } = parsed.data;
  if (range === 'custom' && !date) {
    return NextResponse.json({ error: 'בטווח מותאם — חובה לבחור תאריך' }, { status: 400 });
  }
  if (filters?.deliveryOnly && filters?.pickupOnly) {
    return NextResponse.json({ error: 'לא ניתן לבחור גם משלוחים בלבד וגם איסוף בלבד' }, { status: 400 });
  }

  const input: ReportInput = { range, date, filters, note };
  const reportFilters: ReportFilters = filters ?? {};

  try {
    const { startDate, endDate, label } = resolveRange(input);
    const { orders, itemsByOrder, summary } = await fetchOrdersForReport(startDate, endDate, reportFilters);

    // Compute totals from the orders we already fetched — same source the
    // real report uses, no additional query.
    const totalAmount = orders.reduce(
      (sum, o) => sum + Number((o as Record<string, unknown>).סך_הכל_לתשלום || 0),
      0,
    );

    // Build the *actual* report HTML so the modal can iframe the same
    // content the recipient will see. WYSIWYG by construction — preview and
    // sent email cannot drift apart.
    const fullSummary: ReportSummary = { ...summary, startDate, endDate, rangeLabel: label };
    const html = buildReportHtml(fullSummary, orders, itemsByOrder, false, note);

    return NextResponse.json({
      ok: true,
      summary: {
        ...summary,
        rangeLabel: label,
        startDate,
        endDate,
        totalAmount,
      },
      html,
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
