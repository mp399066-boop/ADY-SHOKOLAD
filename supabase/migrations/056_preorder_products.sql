-- ============================================================================
-- Migration 056: מוצרים "בהזמנה מראש" — exempt from the stock guard.
--
-- Migration 052 added a hard block: an order can't be created/finalized/edited
-- when a line's quantity exceeds what's on hand (order_stock_guard). That is
-- correct for items sold off the shelf, but the catalog also holds items that
-- are MADE TO ORDER — nothing is ever kept in stock for them, so the guard
-- fired on every single order and forced a detour to the inventory screen just
-- to invent a stock number.
--
-- This column marks those items. When בהזמנה_מראש = TRUE the stock-availability
-- guard skips the item entirely. Deduction is unchanged: the ledger still
-- books the movement, and is allowed to go negative — the honest state.
--
-- Added to both catalogs the guard checks: מוצרים_למכירה and סוגי_פטיפורים.
-- Set from מוצרים (the item's edit dialog) or inline in מלאי → "אופן הזמנה".
--
-- NOT NULL DEFAULT FALSE — every existing row keeps today's behaviour.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ============================================================================

ALTER TABLE "מוצרים_למכירה"
  ADD COLUMN IF NOT EXISTS "בהזמנה_מראש" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "מוצרים_למכירה"."בהזמנה_מראש" IS
  'מוצר המיוצר בהזמנה מראש (לא נשמר במלאי). כשמסומן — חסימת ההזמנה במלאי חסר לא חלה על המוצר.';

ALTER TABLE "סוגי_פטיפורים"
  ADD COLUMN IF NOT EXISTS "בהזמנה_מראש" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "סוגי_פטיפורים"."בהזמנה_מראש" IS
  'פטיפור המיוצר בהזמנה מראש (לא נשמר במלאי). כשמסומן — חסימת ההזמנה במלאי חסר לא חלה עליו.';

-- Keep the control-center copy for the guard accurate about the new exemption.
UPDATE "system_services"
   SET "description" = 'חוסם יצירת/עדכון הזמנה כשהכמות המבוקשת עולה על מה שקיים במלאי (מוצרים ופטיפורים). לא חל על פריטים שסומנו "בהזמנה מראש", על טיוטות שלא נסגרו, או על הזמנות שבוטלו.'
 WHERE "service_key" = 'order_stock_guard';

-- Verify (read-only, last so its result is the one the SQL Editor shows).
-- Should list the new column on both tables: boolean / NO / false.
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE column_name = 'בהזמנה_מראש'
   AND table_name IN ('מוצרים_למכירה', 'סוגי_פטיפורים')
 ORDER BY table_name;
