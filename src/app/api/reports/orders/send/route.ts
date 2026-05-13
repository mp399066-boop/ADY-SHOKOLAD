export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { sendOrdersReport, type ReportInput } from '@/lib/orders-report-email';

// POST /api/reports/orders/send
// Read-only: builds a styled email from current orders and sends it.
// Never writes to DB, never creates invoices, never changes statuses.
const bodySchema = z.object({
  range: z.enum(['today', 'tomorrow', 'week', 'custom']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recipientEmail: z.string().email('כתובת מייל לא תקינה'),
  filters: z.object({
    urgentOnly: z.boolean().optional(),
    unpaidOnly: z.boolean().optional(),
    deliveryOnly: z.boolean().optional(),
    pickupOnly: z.boolean().optional(),
  }).optional(),
  // Same optional note shape as the preview route — UI sends both with the
  // identical body so what the user saw in the modal is what gets sent.
  note: z.string().max(2000).optional(),
  // Per-order time overrides — same shape as preview. Forwarded into the
  // builder so the email body shows whatever the operator typed in the UI.
  timeOverrides: z.record(z.string().max(80)).optional(),
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

  const { range, date, recipientEmail, filters, note, timeOverrides } = parsed.data;
  if (range === 'custom' && !date) {
    return NextResponse.json({ error: 'בטווח מותאם — חובה לבחור תאריך' }, { status: 400 });
  }
  if (filters?.deliveryOnly && filters?.pickupOnly) {
    return NextResponse.json({ error: 'לא ניתן לבחור גם משלוחים בלבד וגם איסוף בלבד' }, { status: 400 });
  }

  const input: ReportInput = { range, date, filters, note, timeOverrides };

  try {
    const { summary, subject } = await sendOrdersReport(recipientEmail, input);
    return NextResponse.json({
      ok: true,
      message: `דוח נשלח ל-${recipientEmail}`,
      summary,
      subject,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
    console.error('[reports/orders/send] failed:', msg);
    return NextResponse.json({ error: `שגיאה בשליחת דוח: ${msg}` }, { status: 500 });
  }
}
