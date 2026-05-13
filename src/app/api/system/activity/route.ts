export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenAdminResponse, unauthorizedResponse, requireAuthorizedUser } from '@/lib/auth/requireAuthorizedUser';

// GET /api/system/activity
//
// Admin-only. Paginated feed for the activity-log tab in /settings/system-control.
//
// Query params (all optional):
//   limit          int (1-200, default 50)
//   offset         int (default 0)
//   module         orders | customers | deliveries | inventory | products | finance | reports | settings | auth | integrations | assistant
//   status         success | failed | skipped | warning | disabled
//   actor_type     user | system | webhook | cron | public_token
//   entity_type    order | customer | delivery | product | invoice | inventory_item | user | service
//   entity_id      text
//   service_key    one of the registered service keys
//   from           ISO date  (created_at >= from)
//   to             ISO date  (created_at <= to)
//   q              free-text — matches title / description / entity_label / actor_email (ilike)
//
// Response: { items, total, hasMore }
export async function GET(req: NextRequest) {
  const user = await requireAdminUser();
  if (!user) {
    const anyUser = await requireAuthorizedUser();
    return anyUser ? forbiddenAdminResponse() : unauthorizedResponse();
  }

  const sp = new URL(req.url).searchParams;
  const limitRaw  = parseInt(sp.get('limit')  || '50', 10);
  const offsetRaw = parseInt(sp.get('offset') || '0',  10);
  const limit  = Number.isFinite(limitRaw)  ? Math.max(1, Math.min(200, limitRaw)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const moduleFilter = sp.get('module')     || '';
  const status      = sp.get('status')      || '';
  const actorType   = sp.get('actor_type')  || '';
  const entityType  = sp.get('entity_type') || '';
  const entityId    = sp.get('entity_id')   || '';
  const serviceKey  = sp.get('service_key') || '';
  const from        = sp.get('from')        || '';
  const to          = sp.get('to')          || '';
  const q           = sp.get('q')           || '';

  const supabase = createAdminClient();

  // We need both the page and the total count, so { count: 'exact' }.
  let query = supabase
    .from('system_activity_logs')
    .select(
      'id, created_at, actor_type, actor_user_id, actor_email, actor_name, module, action, status, entity_type, entity_id, entity_label, title, description, old_value, new_value, metadata, error_message, ip_address, user_agent, service_key, related_run_id',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (moduleFilter) query = query.eq('module',     moduleFilter);
  if (status)     query = query.eq('status',       status);
  if (actorType)  query = query.eq('actor_type',   actorType);
  if (entityType) query = query.eq('entity_type',  entityType);
  if (entityId)   query = query.eq('entity_id',    entityId);
  if (serviceKey) query = query.eq('service_key',  serviceKey);
  if (from)       query = query.gte('created_at',  from);
  if (to)         query = query.lte('created_at',  to);
  if (q) {
    // Free-text across the four fields most likely to carry the operator's
    // search term. Each individual ilike clause is safe — Supabase escapes %.
    const safe = q.replace(/[%_]/g, '\\$&').slice(0, 80);
    query = query.or(
      `title.ilike.%${safe}%,description.ilike.%${safe}%,entity_label.ilike.%${safe}%,actor_email.ilike.%${safe}%`,
    );
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items:   data || [],
    total:   count ?? (data?.length ?? 0),
    hasMore: (offset + (data?.length ?? 0)) < (count ?? 0),
  });
}
