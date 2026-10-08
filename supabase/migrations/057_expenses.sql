-- 057_expenses.sql
-- ---------------------------------------------------------------------------
-- הוצאות (business expenses) for the /finance page.
--
-- Every shekel that goes out of the business: supplier invoices, salaries,
-- rent, electricity, packaging, couriers… Entered by hand or imported from
-- the bookkeeping export (Excel / CSV). Together with the order income this
-- drives the profit & loss view (רווח והפסד).
--
-- Amounts:
--   "סכום" — the full amount paid, VAT included (what left the bank).
--   "מעמ"  — the deductible VAT inside that amount (0 for salaries etc.).
--   Net expense (for P&L) = סכום − מעמ.
--
-- "ספק_id" links to the suppliers table when the expense is from a known
-- supplier; "שם_ספק" always carries a display name (imported rows often name
-- a payee that isn't a supplier card).
--
-- "מקור" = 'ידני' | 'ייבוא'. Imports de-duplicate on
-- (תאריך, סכום, שם_ספק, מספר_מסמך) in the API, so re-importing the same file
-- does not double the expenses.
--
-- Also seeds the editable expense-category list (system_option_lists,
-- migration 049) so it appears under הגדרות → רשימות ניהול.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "הוצאות" (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "תאריך"           date          NOT NULL,
  "ספק_id"          uuid          REFERENCES "ספקים"(id) ON DELETE SET NULL,
  "שם_ספק"          text,
  "קטגוריה"         text          NOT NULL DEFAULT 'אחר',
  "תיאור"           text,
  "סכום"            numeric(12,2) NOT NULL CHECK ("סכום" >= 0),
  "מעמ"             numeric(12,2) NOT NULL DEFAULT 0 CHECK ("מעמ" >= 0),
  "מספר_מסמך"       text,
  "אמצעי_תשלום"     text,
  "הערות"           text,
  "מקור"            text          NOT NULL DEFAULT 'ידני',
  "נוצר_על_ידי"     text,
  "תאריך_יצירה"     timestamptz   NOT NULL DEFAULT now(),
  "תאריך_עדכון"     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT "הוצאות_מעמ_לא_גדול_מסכום" CHECK ("מעמ" <= "סכום")
);

CREATE INDEX IF NOT EXISTS "idx_הוצאות_תאריך" ON "הוצאות" ("תאריך");
CREATE INDEX IF NOT EXISTS "idx_הוצאות_ספק"   ON "הוצאות" ("ספק_id");

-- RLS — same posture as every other business table (migration 011):
-- RLS on, no policies ⇒ deny-all for anon/authenticated; the server's
-- service_role client bypasses it.
ALTER TABLE "הוצאות" ENABLE ROW LEVEL SECURITY;

-- Editable expense categories (רשימות ניהול).
INSERT INTO public.system_option_lists (list_key, value, label, sort_order, is_system)
SELECT 'expense_categories', v.value, v.value, v.ord, true
  FROM (VALUES
    ('ספקים וחומרי גלם', 0),
    ('אריזות', 1),
    ('משכורות ועובדים', 2),
    ('שכירות', 3),
    ('חשמל', 4),
    ('מים וגז', 5),
    ('שליחויות ומשלוחים', 6),
    ('פרסום ושיווק', 7),
    ('ציוד', 8),
    ('רכב ודלק', 9),
    ('תקשורת ואינטרנט', 10),
    ('הנהלת חשבונות', 11),
    ('עמלות סליקה ובנק', 12),
    ('ביטוחים', 13),
    ('מיסים ואגרות', 14),
    ('אחר', 15)
  ) AS v(value, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.system_option_lists s
    WHERE s.list_key = 'expense_categories' AND s.value = v.value
 );

-- Verify (read-only).
SELECT count(*) AS expenses_rows FROM "הוצאות";
SELECT count(*) AS expense_categories FROM public.system_option_lists WHERE list_key = 'expense_categories';
