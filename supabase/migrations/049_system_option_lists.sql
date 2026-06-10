-- 049_system_option_lists.sql
-- ---------------------------------------------------------------------------
-- Configurable "managed lists" (רשימות ניהול) — Phase 1 of the in-system
-- settings area. One generic table holds every editable content/option list
-- (product categories, payment methods, customer/order sources, units).
--
-- ONLY pure content lists live here. Logic-driving enums (order/payment/
-- delivery statuses, discount/product types, pricing tiers) are intentionally
-- NOT managed from this table — they stay hardcoded.
--
-- Safe to run more than once (IF NOT EXISTS + ON CONFLICT DO NOTHING).
-- The app keeps working before this migration is applied: the API falls back
-- to the hardcoded defaults in src/lib/option-lists.ts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_option_lists (
  id          uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_key    text          NOT NULL,           -- e.g. 'payment_methods'
  value       text          NOT NULL,           -- canonical value stored on records
  label       text          NOT NULL,           -- display label (usually == value)
  sort_order  integer       NOT NULL DEFAULT 0,
  is_active   boolean       NOT NULL DEFAULT true,
  is_system   boolean       NOT NULL DEFAULT false,  -- seeded default: never hard-delete, only disable
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (list_key, value)
);

CREATE INDEX IF NOT EXISTS idx_system_option_lists_key_active
  ON public.system_option_lists (list_key, is_active, sort_order);

-- ── Make קטגוריית_מוצר a true free-text field ───────────────────────────────
-- It previously carried a CHECK constraint locking it to the 5 hardcoded
-- categories, which would reject any user-added category. Drop the CHECK so
-- the list can be managed from the UI. Column stays NOT NULL DEFAULT 'אחר',
-- so existing rows and the 'עוגה' pricing branch are unaffected; new custom
-- categories simply behave as generic (non-cake) categories.
ALTER TABLE "מוצרים_למכירה" DROP CONSTRAINT IF EXISTS "מוצרים_קטגוריה_check";

-- ── Seed current hardcoded values as system defaults ────────────────────────
-- is_system = true  → cannot be hard-deleted from the UI, only disabled.

INSERT INTO public.system_option_lists (list_key, value, label, sort_order, is_system)
VALUES
  -- Product categories (קטגוריית_מוצר)
  ('product_categories', 'עוגה',     'עוגה',     0, true),
  ('product_categories', 'פטיפורים', 'פטיפורים', 1, true),
  ('product_categories', 'קינוחים',  'קינוחים',  2, true),
  ('product_categories', 'מארז',     'מארז',     3, true),
  ('product_categories', 'אחר',      'אחר',      4, true),

  -- Payment methods (אופן_תשלום / אמצעי_תשלום)
  ('payment_methods', 'מזומן',          'מזומן',          0, true),
  ('payment_methods', 'כרטיס אשראי',    'כרטיס אשראי',    1, true),
  ('payment_methods', 'העברה בנקאית',   'העברה בנקאית',   2, true),
  ('payment_methods', 'bit',            'bit',            3, true),
  ('payment_methods', 'PayBox',         'PayBox',         4, true),
  ('payment_methods', 'PayPal',         'PayPal',         5, true),
  ('payment_methods', 'המחאה',          'המחאה',          6, true),
  ('payment_methods', 'אחר',            'אחר',            7, true),

  -- Customer acquisition sources (מקור_הגעה)
  ('customer_sources', 'המלצה',     'המלצה',     0, true),
  ('customer_sources', 'אינסטגרם',  'אינסטגרם',  1, true),
  ('customer_sources', 'פייסבוק',   'פייסבוק',   2, true),
  ('customer_sources', 'WhatsApp',  'WhatsApp',  3, true),
  ('customer_sources', 'גוגל',      'גוגל',      4, true),
  ('customer_sources', 'אחר',       'אחר',       5, true),

  -- Order sources (מקור_ההזמנה)
  ('order_sources', 'טלפון',     'טלפון',     0, true),
  ('order_sources', 'WhatsApp',  'WhatsApp',  1, true),
  ('order_sources', 'אינסטגרם',  'אינסטגרם',  2, true),
  ('order_sources', 'פייסבוק',   'פייסבוק',   3, true),
  ('order_sources', 'אתר',       'אתר',       4, true),
  ('order_sources', 'הפניה',     'הפניה',     5, true),
  ('order_sources', 'אחר',       'אחר',       6, true),

  -- Units of measure (יחידת_מידה)
  ('units_of_measure', 'ק"ג',   'ק"ג',   0, true),
  ('units_of_measure', 'גרם',   'גרם',   1, true),
  ('units_of_measure', 'ליטר',  'ליטר',  2, true),
  ('units_of_measure', 'מ"ל',   'מ"ל',   3, true),
  ('units_of_measure', 'יח׳',   'יח׳',   4, true),
  ('units_of_measure', 'כף',    'כף',    5, true),
  ('units_of_measure', 'כוס',   'כוס',   6, true)
ON CONFLICT (list_key, value) DO NOTHING;
