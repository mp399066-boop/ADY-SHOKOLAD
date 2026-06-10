-- 050_system_config.sql
-- ---------------------------------------------------------------------------
-- Phase 2 — safe system defaults (ברירות מחדל).
--
-- A generic key/value table for SAFE business defaults only — the initial
-- values that forms pre-fill with. It does NOT hold logic-driving enums,
-- statuses, pricing rules, or anything enforced by CHECK constraints/triggers.
--
-- Safe to run more than once (IF NOT EXISTS + ON CONFLICT DO NOTHING).
-- The app keeps working before this migration is applied: the API/hook fall
-- back to the same hardcoded defaults seeded below.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_config (
  key         text         PRIMARY KEY,
  value       text,
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Seed the current hardcoded defaults. Values mirror what the forms use today,
-- so behavior is unchanged until the operator edits them.
INSERT INTO public.system_config (key, value)
VALUES
  ('default_payment_method',          'מזומן'),
  ('default_order_source',            ''),
  ('default_customer_source',         ''),
  ('default_delivery_fee',            '0'),
  ('default_low_stock_threshold',     '0'),
  ('default_critical_stock_threshold','0'),
  ('default_unit_of_measure',         'ק"ג')
ON CONFLICT (key) DO NOTHING;
