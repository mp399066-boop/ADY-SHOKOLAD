export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendOrdersReport } from '@/lib/orders-report-email';
import { createAdminClient } from '@/lib/supabase/server';
import { isServiceEnabled, logServiceRun } from '@/lib/system-services';

// GET /api/cron/send-daily-orders-report
// Triggered by Vercel Cron daily. Sends today's orders report to DAILY_ORDERS_REPORT_EMAIL.
// Auth: Vercel automatically adds `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
// Reuses sendOrdersReport — no template duplication, no DB writes, no invoice work.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/daily-report] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${secret}`) {
    console.warn('[cron/daily-report] unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const recipient = process.env.DAILY_ORDERS_REPORT_EMAIL;
  if (!recipient) {
    console.error('[cron/daily-report] DAILY_ORDERS_REPORT_EMAIL is not configured');
    return NextResponse.json({ error: 'DAILY_ORDERS_REPORT_EMAIL not configured' }, { status: 500 });
  }

  // Control-center kill-switch. The cron still runs (Vercel scheduled it),
  // we just refuse to send the email and log a 'disabled' run so the admin
  // page shows that today's report was suppressed on purpose.
  const supabaseAdmin = createAdminClient();
  if (!(await isServiceEnabled(supabaseAdmin, 'daily_orders_report'))) {
    console.log('[cron/daily-report] service is OFF in control center — skipping send');
    await logServiceRun(supabaseAdmin, {
      serviceKey: 'daily_orders_report',
      action:     'send_daily_report',
      status:     'disabled',
      message:    'daily report NOT sent — service disabled in control center',
    });
    return NextResponse.json({ ok: true, skipped: true, reason: 'service_disabled' });
  }

  const startedAt = new Date();
  try {
    const { summary } = await sendOrdersReport(recipient, { range: 'today' });
    console.log(
      `[cron/daily-report] sent — date: ${summary.startDate} | total: ${summary.total} | urgent: ${summary.urgent} | unpaid: ${summary.unpaid} | delivery: ${summary.delivery} | pickup: ${summary.pickup}`,
    );
    const finishedAt = new Date();
    await logServiceRun(supabaseAdmin, {
      serviceKey:  'daily_orders_report',
      action:      'send_daily_report',
      status:      'success',
      startedAt, finishedAt,
      durationMs:  finishedAt.getTime() - startedAt.getTime(),
      message:     `נשלח ל-${recipient} · ${summary.total} הזמנות`,
      metadata:    { recipient, total: summary.total, date: summary.startDate, urgent: summary.urgent, unpaid: summary.unpaid },
    });
    return NextResponse.json({
      ok: true,
      date: summary.startDate,
      total: summary.total,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[cron/daily-report] send failed:', msg);
    const finishedAt = new Date();
    await logServiceRun(supabaseAdmin, {
      serviceKey:    'daily_orders_report',
      action:        'send_daily_report',
      status:        'failed',
      startedAt, finishedAt,
      durationMs:    finishedAt.getTime() - startedAt.getTime(),
      errorMessage:  msg,
    });
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }
}
