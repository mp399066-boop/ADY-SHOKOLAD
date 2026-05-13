// ============================================================================
// System services control center — runtime helpers.
//
// Public API:
//   isServiceEnabled(supabase, key)
//     Reads system_services.is_enabled. Defaults to TRUE on any DB error
//     (table missing, network blip, …) — a broken control center MUST NOT
//     halt production work.
//
//   logServiceRun(supabase, opts)
//     Best-effort INSERT into system_service_runs. Swallows its own errors;
//     a logging failure must not break the operation it was logging.
//     Also bumps system_services.last_run_at + last_status for cheap reads
//     by the admin page.
//
//   withServiceGuard(supabase, key, action, callback, [meta])
//     The standard wrapper for all server-side gates.
//     - If the toggle is OFF: skip the callback, log a 'disabled' run,
//       return { ok: false, skipped: true, reason: 'service_disabled' }.
//     - If ON: run the callback, log success/failure, return { ok, result }
//       (or rethrow on failure so the caller's existing error path is
//       preserved).
//
// Why fail-open: this layer is observability + a kill switch, not an
// authorization layer. Auth is upstream (requireManagementUser / requireAdmin).
// We never want a stale flag or a missing table to silently hide receipts.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/server';

// ── Service registry ─────────────────────────────────────────────────────────
// The eight services seeded by migration 026. Adding a new service:
//   1. add the key here  2. seed it in the migration  3. wrap the call site
//      with withServiceGuard.

export const SERVICE_KEYS = [
  'morning_documents',
  'customer_order_emails',
  'admin_alerts',
  'delivery_notifications',
  'daily_orders_report',
  'woocommerce_orders',
  'inventory_deduction',
  'payplus_payments',
] as const;

export type ServiceKey = typeof SERVICE_KEYS[number];

// Hebrew labels — used by the API route that shapes data for the UI.
// Authoritative copy stays in the DB (seeded by migration 026); these are
// only fallbacks for older deployments where the seed hasn't run yet.
export const SERVICE_FALLBACK_LABELS: Record<ServiceKey, { display: string; description: string; category: string }> = {
  morning_documents:      { display: 'הפקת מסמכים פיננסיים',     description: 'הפקת חשבוניות / קבלות דרך Morning.',                category: 'finance'      },
  customer_order_emails:  { display: 'אישורי הזמנה ללקוחות',      description: 'מייל אישור הזמנה ללקוחה לאחר יצירת הזמנה.',          category: 'emails'       },
  admin_alerts:           { display: 'התראות פנימיות לבעלת העסק', description: 'מיילים פנימיים על הזמנה חדשה ואירועים חשובים.',     category: 'emails'       },
  delivery_notifications: { display: 'משלוחים — קישורים לשליח',   description: 'בניית הודעת וואטסאפ עם קישור עדכון משלוח.',          category: 'deliveries'   },
  daily_orders_report:    { display: 'דוח יומי אוטומטי',           description: 'שליחת דוח יומי של הזמנות במייל.',                    category: 'reports'      },
  woocommerce_orders:     { display: 'WooCommerce — קבלת הזמנות', description: 'קבלת הזמנות מהאתר והכנסתן למערכת.',                  category: 'integrations' },
  inventory_deduction:    { display: 'הורדת מלאי אוטומטית',        description: 'הורדת מלאי בעת מעבר סטטוס תשלום ל-"שולם".',          category: 'inventory'    },
  payplus_payments:       { display: 'PayPlus — קישורי תשלום',     description: 'יצירת קישורי תשלום דרך PayPlus.',                    category: 'integrations' },
};

// Caller-facing error message shown when a service is disabled. Same string
// for every gated path so the UX is predictable and recognisable.
export const SERVICE_DISABLED_MESSAGE = 'השירות כבוי כרגע במרכז הבקרה. ניתן להפעיל אותו דרך הגדרות → מרכז בקרה.';

// ── Types ────────────────────────────────────────────────────────────────────

type AnySupabase = ReturnType<typeof createAdminClient>;

export type ServiceRunStatus = 'success' | 'failed' | 'skipped' | 'running' | 'disabled';

export interface LogServiceRunOptions {
  serviceKey: ServiceKey;
  action?: string;
  status: ServiceRunStatus;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  relatedType?: string | null;
  relatedId?: string | null;
  message?: string | null;
  errorMessage?: string | null;
  // metadata is INSERT'd as jsonb. Caller is responsible for redacting any
  // secrets (tokens, API keys) before passing here. Keep it small — the
  // admin page renders it as-is in a modal.
  metadata?: Record<string, unknown> | null;
}

export type GuardResult<T> =
  | { ok: true; skipped?: false; result: T }
  | { ok: false; skipped: true; reason: 'service_disabled'; message: string };

// ── isServiceEnabled ─────────────────────────────────────────────────────────

export async function isServiceEnabled(
  supabase: AnySupabase,
  key: ServiceKey,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('system_services')
      .select('is_enabled')
      .eq('service_key', key)
      .maybeSingle();
    // Fail-open: DB error / missing row / missing table → assume enabled.
    // The admin page surfaces missing rows as "not registered" so the
    // operator can investigate, but production code keeps flowing.
    if (error || !data) return true;
    return !!data.is_enabled;
  } catch {
    return true;
  }
}

// ── logServiceRun ────────────────────────────────────────────────────────────

export async function logServiceRun(
  supabase: AnySupabase,
  opts: LogServiceRunOptions,
): Promise<void> {
  try {
    const startedAt = opts.startedAt ?? new Date();
    const finishedAt = opts.finishedAt ?? null;
    const durationMs =
      opts.durationMs != null
        ? opts.durationMs
        : finishedAt
          ? finishedAt.getTime() - startedAt.getTime()
          : null;

    await supabase.from('system_service_runs').insert({
      service_key:    opts.serviceKey,
      action:         opts.action ?? null,
      status:         opts.status,
      started_at:     startedAt.toISOString(),
      finished_at:    finishedAt ? finishedAt.toISOString() : null,
      duration_ms:    durationMs,
      related_type:   opts.relatedType ?? null,
      related_id:     opts.relatedId ?? null,
      message:        opts.message ?? null,
      error_message:  opts.errorMessage ?? null,
      metadata:       opts.metadata ?? null,
    });

    // Mirror the latest run on the parent row so the admin page can render
    // a "last run" column without joining. Best-effort — if this fails the
    // run row is still recorded.
    if (opts.status !== 'running') {
      await supabase
        .from('system_services')
        .update({
          last_run_at: (finishedAt ?? startedAt).toISOString(),
          last_status: opts.status,
          updated_at:  new Date().toISOString(),
        })
        .eq('service_key', opts.serviceKey);
    }
  } catch (err) {
    // Logging is observability, not safety — never let it crash the caller.
    // eslint-disable-next-line no-console
    console.warn('[system-services] logServiceRun failed:', err instanceof Error ? err.message : err);
  }
}

// ── withServiceGuard ─────────────────────────────────────────────────────────

export async function withServiceGuard<T>(
  supabase: AnySupabase,
  key: ServiceKey,
  action: string,
  callback: () => Promise<T>,
  opts: {
    relatedType?: string | null;
    relatedId?: string | null;
    metadata?: Record<string, unknown> | null;
  } = {},
): Promise<GuardResult<T>> {
  const enabled = await isServiceEnabled(supabase, key);
  const startedAt = new Date();

  if (!enabled) {
    await logServiceRun(supabase, {
      serviceKey:   key,
      action,
      status:       'disabled',
      startedAt,
      finishedAt:   new Date(),
      durationMs:   0,
      relatedType:  opts.relatedType ?? null,
      relatedId:    opts.relatedId ?? null,
      message:      'service disabled — operation skipped',
      metadata:     opts.metadata ?? null,
    });
    return {
      ok: false,
      skipped: true,
      reason: 'service_disabled',
      message: SERVICE_DISABLED_MESSAGE,
    };
  }

  try {
    const result = await callback();
    const finishedAt = new Date();
    await logServiceRun(supabase, {
      serviceKey:   key,
      action,
      status:       'success',
      startedAt,
      finishedAt,
      durationMs:   finishedAt.getTime() - startedAt.getTime(),
      relatedType:  opts.relatedType ?? null,
      relatedId:    opts.relatedId ?? null,
      metadata:     opts.metadata ?? null,
    });
    return { ok: true, result };
  } catch (err) {
    const finishedAt = new Date();
    const errMessage = err instanceof Error ? err.message : String(err);
    await logServiceRun(supabase, {
      serviceKey:    key,
      action,
      status:        'failed',
      startedAt,
      finishedAt,
      durationMs:    finishedAt.getTime() - startedAt.getTime(),
      relatedType:   opts.relatedType ?? null,
      relatedId:     opts.relatedId ?? null,
      errorMessage:  errMessage,
      metadata:      opts.metadata ?? null,
    });
    // Rethrow so the caller's existing error handling still runs. The log
    // entry is purely for observability; the original control flow stays put.
    throw err;
  }
}
