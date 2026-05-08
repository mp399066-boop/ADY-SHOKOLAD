export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { generateOrdersReport, type ReportInput } from '@/lib/orders-report-email';

// POST /api/reports/orders/download
// Returns the report HTML for browser download/print. Read-only — never writes to DB.
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
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 });
  }

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

  try {
    const { html, summary } = await generateOrdersReport(input, { forDownload: true });
    const filename = `orders-report-${summary.startDate}.html`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Report-Total': String(summary.total),
        'X-Report-Filename': filename,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    console.error('[reports/orders/download] failed:', msg);
    return NextResponse.json({ error: `שגיאה ביצירת דוח: ${msg}` }, { status: 500 });
  }
}
