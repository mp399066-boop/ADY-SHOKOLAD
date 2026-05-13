// ============================================================================
// System activity log — fire-and-forget audit trail.
//
// Hard rule: logActivity NEVER throws. If the DB is down, the table is
// missing, or a JSON value is bad — we console.error and return. The
// production work that called us must keep flowing.
//
// Authoritative call sites are listed in the user request; not every write
// gets a row — only the operationally interesting events ("מי, מה, מתי,
// על מה"). Internal Edge-Function-style retries DO get a row each time so
// the operator can see retry storms.
//
// Redaction discipline:
//   - never log API keys, webhook secrets, service_role tokens
//   - jsonb columns are caller-controlled; pass only sanitised values
//   - request hint includes IP + UA, NOT auth headers
// ============================================================================

import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAuthorizedUser, type AuthorizedUser } from '@/lib/auth/requireAuthorizedUser';

// ── Vocabulary ──────────────────────────────────────────────────────────────

export type ActorType = 'user' | 'system' | 'webhook' | 'cron' | 'public_token';

export type ActivityStatus = 'success' | 'failed' | 'skipped' | 'warning' | 'disabled';

export type ActivityModule =
  | 'orders'
  | 'customers'
  | 'deliveries'
  | 'inventory'
  | 'products'
  | 'finance'
  | 'reports'
  | 'settings'
  | 'auth'
  | 'integrations'
  | 'assistant';

export interface ActivityActor {
  type: ActorType;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
}

// Hebrew display labels for the UI. Kept here so the UI doesn't reinvent
// the mapping; both the page and the modal import from this file.
export const STATUS_LABEL_HE: Record<ActivityStatus, string> = {
  success:  'הצליח',
  failed:   'נכשל',
  skipped:  'דולג',
  warning:  'אזהרה',
  disabled: 'כבוי',
};

export const ACTOR_LABEL_HE: Record<ActorType, string> = {
  user:         'משתמש',
  system:       'המערכת',
  webhook:      'אינטגרציה',
  cron:         'פעולה מתוזמנת',
  public_token: 'קישור ציבורי',
};

export const MODULE_LABEL_HE: Record<ActivityModule, string> = {
  orders:       'הזמנות',
  customers:    'לקוחות',
  deliveries:   'משלוחים',
  inventory:    'מלאי',
  products:     'מוצרים',
  finance:      'פיננסים',
  reports:      'דוחות',
  settings:     'הגדרות',
  auth:         'משתמשים והרשאות',
  integrations: 'אינטגרציות',
  assistant:    'עוזרת חכמה',
};

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface LogActivityOptions {
  actor?: ActivityActor;
  module: ActivityModule;
  action: string;
  status?: ActivityStatus;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  title: string;
  description?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
  serviceKey?: string | null;
  relatedRunId?: string | null;
  // Optional NextRequest for IP + UA capture. We never read auth headers.
  request?: NextRequest | Request | null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Try to identify the user behind this request via the SSR cookie session.
 * Returns null when there's no logged-in user (caller can default to a
 * different actor type — e.g. webhook / cron / system).
 *
 * Note: this is fail-safe. Any error → null.
 */
export async function getActorFromRequest(): Promise<ActivityActor | null> {
  try {
    const user: AuthorizedUser | null = await requireAuthorizedUser();
    if (!user) return null;
    return {
      type:   'user',
      userId: user.id,
      email:  user.email,
      name:   null,
    };
  } catch {
    return null;
  }
}

/**
 * Append one row to system_activity_logs. Never throws.
 */
export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    const supabase = createAdminClient();
    const actor = opts.actor ?? { type: 'system' as const };

    const { ipAddress, userAgent } = extractRequestHints(opts.request);

    await supabase.from('system_activity_logs').insert({
      actor_type:     actor.type,
      actor_user_id:  actor.userId  ?? null,
      actor_email:    actor.email   ?? null,
      actor_name:     actor.name    ?? null,

      module:         opts.module,
      action:         opts.action,
      status:         opts.status ?? 'success',

      entity_type:    opts.entityType  ?? null,
      entity_id:      opts.entityId    ?? null,
      entity_label:   opts.entityLabel ?? null,

      title:          opts.title,
      description:    opts.description ?? null,

      old_value:      opts.oldValue !== undefined ? opts.oldValue : null,
      new_value:      opts.newValue !== undefined ? opts.newValue : null,
      metadata:       opts.metadata ?? null,

      error_message:  opts.errorMessage ?? null,

      ip_address:     ipAddress,
      user_agent:     userAgent,

      service_key:    opts.serviceKey ?? null,
      related_run_id: opts.relatedRunId ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[activity-log] insert failed (silently ignored):', err instanceof Error ? err.message : err);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractRequestHints(req: NextRequest | Request | null | undefined): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  try {
    const headers = (req as { headers: Headers }).headers;
    if (!headers || typeof headers.get !== 'function') return { ipAddress: null, userAgent: null };
    // x-forwarded-for is the conventional Vercel + Cloudflare hop. Take the
    // first hop (client IP) and clamp to 64 chars defensively.
    const forwarded = headers.get('x-forwarded-for') || '';
    const ip = forwarded.split(',')[0]?.trim() || headers.get('x-real-ip') || null;
    const ua = headers.get('user-agent') || null;
    return {
      ipAddress: ip ? ip.slice(0, 64) : null,
      userAgent: ua ? ua.slice(0, 200) : null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

// ── Convenience wrappers for common actor shapes ────────────────────────────

export const SYSTEM_ACTOR:        ActivityActor = { type: 'system' };
export const WEBHOOK_ACTOR_WC:    ActivityActor = { type: 'webhook', name: 'WooCommerce' };
export const CRON_ACTOR:          ActivityActor = { type: 'cron',    name: 'Vercel Cron' };
export const PUBLIC_TOKEN_ACTOR:  ActivityActor = { type: 'public_token', name: 'שליח דרך קישור' };

export function userActor(u: AuthorizedUser): ActivityActor {
  return { type: 'user', userId: u.id, email: u.email, name: null };
}
