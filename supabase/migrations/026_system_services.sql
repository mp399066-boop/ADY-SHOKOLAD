-- ============================================================================
-- 026 — System services control center
-- ============================================================================
-- Two tables that back the admin "מרכז בקרה" page:
--   system_services      → one row per controllable automation
--   system_service_runs  → append-only log of every gated execution
--
-- Why a table instead of env vars:
--   - The owner needs to flip a switch from the UI without a redeploy.
--   - The same flag value must be visible to every API route + EF caller.
--   - Run history is a first-class artifact; tying it to the same key the
--     toggle uses makes the audit trail trivial to read.
--
-- Failure mode: if either table is missing or unreadable, the helpers in
-- src/lib/system-services.ts default to "enabled" and silently skip logging.
-- A broken control center never blocks production work.
-- ============================================================================

create table if not exists system_services (
  id            uuid        primary key default gen_random_uuid(),
  service_key   text        unique not null,
  display_name  text        not null,
  description   text,
  category      text,                                      -- finance / emails / deliveries / inventory / reports / integrations
  is_enabled    boolean     not null default true,
  last_run_at   timestamptz,
  last_status   text,                                      -- mirrors the latest run's status for cheap dashboard reads
  updated_at    timestamptz not null default now(),
  updated_by    uuid                                        -- authorized_users.id of the admin who last toggled
);

create table if not exists system_service_runs (
  id             uuid        primary key default gen_random_uuid(),
  service_key    text        not null,
  action         text,                                     -- short verb: "issue_document", "send_email", "deduct_inventory", …
  status         text        not null check (status in ('success', 'failed', 'skipped', 'running', 'disabled')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration_ms    integer,
  related_type   text,                                     -- "order" | "delivery" | "customer" | …
  related_id     text,
  message        text,                                     -- short human-readable message
  error_message  text,                                     -- full error if status='failed'
  metadata       jsonb,                                    -- redacted payload (no secrets)
  created_at     timestamptz not null default now()
);

-- Recent-runs queries from the admin page filter by service + sort by time.
create index if not exists system_service_runs_key_started_idx
  on system_service_runs (service_key, started_at desc);

create index if not exists system_service_runs_status_idx
  on system_service_runs (status, started_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Both tables only ever read/written via the service_role key (server-side
-- routes only). Nothing in the UI talks to them via the anon key. We still
-- enable RLS so a future anon caller is denied by default.
alter table system_services       enable row level security;
alter table system_service_runs   enable row level security;

-- (No policies for authenticated/anon — server uses service_role which
--  bypasses RLS. The admin page reads through gated /api/system/* routes.)

-- ── Seed: register every automation the helper will reference ──────────────
-- ON CONFLICT keeps existing toggle values intact across re-runs of this
-- migration; only the display_name / description / category get refreshed.
insert into system_services (service_key, display_name, description, category, is_enabled) values
  ('morning_documents',      'הפקת מסמכים פיננסיים',          'שליטה על הפקת חשבוניות / קבלות / חשבוניות מס קבלה דרך Morning (Green Invoice). כיבוי השירות חוסם הפקה ידנית מהממשק.', 'finance',      true),
  ('customer_order_emails',  'שליחת אישורי הזמנה ללקוחות',     'מייל אישור הזמנה ללקוח לאחר יצירת הזמנה (כולל webhook של WooCommerce).',                                            'emails',       true),
  ('admin_alerts',           'התראות פנימיות לבעלת העסק',      'מיילים פנימיים על הזמנה חדשה / אירועים חשובים — נשלחים אל כתובת המנהלת.',                                              'emails',       true),
  ('delivery_notifications', 'משלוחים — קישורים לשליח',        'בניית הודעת וואטסאפ עם קישור ציבורי לעדכון "נמסר" כששליח משויך ומעבר לסטטוס "נאסף".',                              'deliveries',   true),
  ('daily_orders_report',    'דוח יומי אוטומטי',                'שליחת דוח יומי של הזמנות + פעילות, מופעל ב-cron של Vercel.',                                                          'reports',      true),
  ('woocommerce_orders',     'WooCommerce — קבלת הזמנות',      'webhook של WooCommerce שיוצר הזמנות במערכת + מתאים מוצרים לקטלוג.',                                                  'integrations', true),
  ('inventory_deduction',    'הורדת מלאי אוטומטית',             'הורדת מלאי בעת מעבר סטטוס תשלום ל-"שולם". כיבוי השירות עוצר deduction אוטומטי בכל הנתיבים.',                       'inventory',    true),
  ('payplus_payments',       'PayPlus — קישורי תשלום',         'יצירת קישורי תשלום דרך PayPlus עבור הזמנות פתוחות.',                                                                   'integrations', true)
on conflict (service_key) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  category     = excluded.category;
