-- 063_manual_income.sql
-- ---------------------------------------------------------------------------
-- הכנסות ידניות (manual income) for the /finance page.
--
-- Income that does not come from an order in the system — a workshop, a
-- market stall, a one-off sale, a refund, a grant… Entered by hand on the
-- הכנסות tab ("+ הכנסה חדשה"), the same way expenses are entered.
--
-- Amounts (same convention as "הוצאות", migration 057):
--   "סכום" — the full amount received, VAT included.
--   "מעמ"  — the VAT inside that amount (0 when no VAT was charged).
--   "נכנס לכיס" for this income = סכום − מעמ.
--
-- Manual income is counted everywhere order income is counted: the income
-- tab, profit & loss and the full report. "שולם" = false puts it in the
-- "טרם שולם" columns, like an unpaid order.
--
-- Also seeds the editable income-category list (system_option_lists,
-- migration 049) so it appears under הגדרות → רשימות ניהול.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "הכנסות_ידניות" (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "תאריך"           date          NOT NULL,
  "שם_לקוח"         text,
  "קטגוריה"         text          NOT NULL DEFAULT 'אחר',
  "תיאור"           text,
  "סכום"            numeric(12,2) NOT NULL CHECK ("סכום" > 0),
  "מעמ"             numeric(12,2) NOT NULL DEFAULT 0 CHECK ("מעמ" >= 0),
  "מספר_מסמך"       text,
  "אמצעי_תשלום"     text,
  "שולם"            boolean       NOT NULL DEFAULT true,
  "הערות"           text,
  "נוצר_על_ידי"     text,
  "תאריך_יצירה"     timestamptz   NOT NULL DEFAULT now(),
  "תאריך_עדכון"     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "הכנסות_ידניות_מעמ_לא_גדול_מסכום" CHECK ("מעמ" <= "סכום")
);

CREATE INDEX IF NOT EXISTS "idx_הכנסות_ידניות_תאריך" ON "הכנסות_ידניות" ("תאריך");

-- RLS — same posture as every other business table (migration 011):
-- RLS on, no policies ⇒ deny-all for anon/authenticated; the server's
-- service_role client bypasses it.
ALTER TABLE "הכנסות_ידניות" ENABLE ROW LEVEL SECURITY;

-- Editable income categories (רשימות ניהול).
INSERT INTO public.system_option_lists (list_key, value, label, sort_order, is_system)
SELECT 'income_categories', v.value, v.value, v.ord, true
  FROM (VALUES
    ('סדנאות', 0),
    ('אירועים', 1),
    ('מכירה ישירה / דוכן', 2),
    ('החזרים וזיכויים', 3),
    ('מענקים', 4),
    ('אחר', 5)
  ) AS v(value, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.system_option_lists s
    WHERE s.list_key = 'income_categories' AND s.value = v.value
 );

-- Verify (read-only): should list the new table's columns.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'הכנסות_ידניות'
 ORDER BY ordinal_position;
