export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenAdminResponse, unauthorizedResponse, requireAuthorizedUser } from '@/lib/auth/requireAuthorizedUser';

// GET /api/system/runs
//
// Returns recent runs for the admin page. Query params:
//   ?service_key=...   — filter to one service
//   ?status=...         — filter by status (success/failed/skipped/disabled/running)
//   ?limit=...          — default 50, max 200
//
// Admin-only. We do not redact anything here — the metadata column is the
// caller's responsibility (helpers in src/lib/system-services.ts and the
// integrated call sites only pass non-secret values).
export async function GET(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    const anyUser = await requireAuthorizedUser();
    return anyUser ? forbiddenAdminResponse() : unauthorizedResponse();
  }

  const { searchParams } = new URL(req.url);
  const serviceKey = searchParams.get('service_key') || '';
  const status     = searchParams.get('status') || '';
  const limitRaw   = parseInt(searchParams.get('limit') || '50', 10);
  const limit      = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

  const supabase = createAdminClient();

  let query = supabase
    .from('system_service_runs')
    .select('id, service_key, action, status, started_at, finished_at, duration_ms, related_type, related_id, message, error_message, metadata')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (serviceKey) query = query.eq('service_key', serviceKey);
  if (status)     query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: data || [] });
}
