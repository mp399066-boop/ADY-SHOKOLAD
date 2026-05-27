export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  requireAdminUser,
  forbiddenAdminResponse,
  unauthorizedResponse,
  requireAuthorizedUser,
} from '@/lib/auth/requireAuthorizedUser';

// GET /api/system/activity/summary
//
// Admin-only. Returns per-category failure/success/warning counts for the
// last N days (default 7), so the /settings/system-control "לוגים" page can
// paint failure badges on the sidebar and a hero alert at the top without
// firing 9 parallel pagination requests.
//
// Query params:
//   days  — lookback window in days (1–60, default 7)
//
// Response shape:
//   {
//     window_days: number,
//     since:       ISO timestamp,
//     by_service:  Record<service_key, { failed: number; warning: number; success: number; total: number }>,
//     by_module:   Record<module,      { failed: number; warning: number; success: number; total: number }>,
//     totals:      { failed: number; warning: number; success: number; total: number },
//   }
//
// No business-logic side-effects. Pure aggregation read.

type Counts = { failed: number; warning: number; success: number; total: number };

function emptyCounts(): Counts { return { failed: 0, warning: 0, success: 0, total: 0 }; }

export async function GET(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    const anyUser = await requireAuthorizedUser();
    return anyUser ? forbiddenAdminResponse() : unauthorizedResponse();
  }

  const sp = new URL(req.url).searchParams;
  const daysRaw = parseInt(sp.get('days') || '7', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(60, daysRaw)) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  // Pull the minimum fields needed for grouping. Cap at 5k rows defensively
  // — the page only needs counts, and we never expect the 7-day window to
  // exceed that for a single-tenant CRM. If it ever does, swap this to a
  // server-side rpc.
  const { data, error } = await supabase
    .from('system_activity_logs')
    .select('module, service_key, status')
    .gte('created_at', since)
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byService: Record<string, Counts> = {};
  const byModule:  Record<string, Counts> = {};
  const totals: Counts = emptyCounts();

  for (const row of (data || []) as Array<{ module: string; service_key: string | null; status: string }>) {
    const status = row.status;
    const bump = (c: Counts) => {
      c.total++;
      if (status === 'failed')  c.failed++;
      if (status === 'warning') c.warning++;
      if (status === 'success') c.success++;
    };

    if (row.service_key) {
      if (!byService[row.service_key]) byService[row.service_key] = emptyCounts();
      bump(byService[row.service_key]);
    }
    if (row.module) {
      if (!byModule[row.module]) byModule[row.module] = emptyCounts();
      bump(byModule[row.module]);
    }
    bump(totals);
  }

  return NextResponse.json({
    window_days: days,
    since,
    by_service:  byService,
    by_module:   byModule,
    totals,
  });
}
