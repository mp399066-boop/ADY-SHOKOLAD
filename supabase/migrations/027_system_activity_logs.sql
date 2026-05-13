-- ============================================================================
-- 027 — System activity log
-- ============================================================================
-- Append-only audit trail for human + automated work. Sits next to
-- system_service_runs (migration 026) but covers the wider surface:
-- order/customer/delivery/inventory/finance/integration events the operator
-- needs to see in one place ("מי, מה, מתי, על מה").
--
-- Failure mode: src/lib/activity-log.ts logActivity() wraps every INSERT
-- in try/catch and only console.errors on failure — so a missing table
-- or a network blip never breaks the operation it was logging.
-- ============================================================================

create table if not exists system_activity_logs (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- WHO did it ──────────────────────────────────────────────────────────
  -- 'user'         — authenticated owner / staff via the dashboard
  -- 'system'       — internal helper / scheduled trigger
  -- 'webhook'      — inbound integration (WooCommerce, etc.)
  -- 'cron'         — Vercel scheduled function
  -- 'public_token' — courier hitting /delivery-update/[token]
  actor_type      text        not null default 'system'
                    check (actor_type in ('user', 'system', 'webhook', 'cron', 'public_token')),
  actor_user_id   uuid,
  actor_email     text,
  actor_name      text,

  -- WHAT module + action ───────────────────────────────────────────────
  -- module values: orders / customers / deliveries / inventory / products /
  --                finance / reports / settings / auth / integrations / assistant
  -- action values are free-form snake_case verbs (order_created,
  --                                                payment_status_changed, …)
  module          text        not null,
  action          text        not null,

  -- HOW it ended ───────────────────────────────────────────────────────
  status          text        not null default 'success'
                    check (status in ('success', 'failed', 'skipped', 'warning', 'disabled')),

  -- WHAT it was about ──────────────────────────────────────────────────
  entity_type     text,                                       -- order / customer / delivery / product / invoice / inventory_item / user / service
  entity_id       text,                                       -- text (not uuid) so service_key + WC ids etc. fit
  entity_label    text,                                       -- human-readable: customer name / order number / product name

  -- DISPLAY copy (Hebrew, ready for the UI) ────────────────────────────
  title           text        not null,
  description     text,

  -- DETAILS (jsonb, redacted by the caller) ────────────────────────────
  old_value       jsonb,
  new_value       jsonb,
  metadata        jsonb,

  -- FAILURE metadata ──────────────────────────────────────────────────
  error_message   text,

  -- REQUEST context (best-effort, optional) ───────────────────────────
  ip_address      text,
  user_agent      text,

  -- LINKS back to the services system ─────────────────────────────────
  service_key     text,                                       -- when this activity was a gated service call
  related_run_id  uuid                                        -- system_service_runs.id, when applicable
);

-- Lookup indexes — every common filter the activity-log UI exposes
create index if not exists system_activity_logs_created_at_idx on system_activity_logs (created_at desc);
create index if not exists system_activity_logs_module_idx     on system_activity_logs (module, created_at desc);
create index if not exists system_activity_logs_action_idx     on system_activity_logs (action, created_at desc);
create index if not exists system_activity_logs_status_idx     on system_activity_logs (status, created_at desc);
create index if not exists system_activity_logs_entity_idx     on system_activity_logs (entity_type, entity_id);
create index if not exists system_activity_logs_actor_idx      on system_activity_logs (actor_email, created_at desc);
create index if not exists system_activity_logs_service_idx    on system_activity_logs (service_key, created_at desc);

-- RLS — same pattern as system_services / system_service_runs.
-- Server-side service_role bypasses RLS. UI never reads this table directly;
-- it goes through GET /api/system/activity (admin-gated).
alter table system_activity_logs enable row level security;
