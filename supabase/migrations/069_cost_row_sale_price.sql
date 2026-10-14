-- 069_cost_row_sale_price.sql
-- ---------------------------------------------------------------------------
-- מחיר מכירה לשורה בטבלת העלויות (/costs).
--
-- Until now the sale price on /costs came only from a linked catalog product
-- (מוצרים_למכירה / מחירון). Rows that are not linked, or are linked to a
-- petit-four (which has no price of its own), had no way to get a sale price,
-- so their profit could not be calculated. This column holds a sale price
-- entered directly on the cost row; it is used only when the row is not linked
-- to a catalog product. Linked products keep using the catalog price.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "עלויות_מוצרים"
  ADD COLUMN IF NOT EXISTS "מחיר_מכירה" numeric(12,2)
  CHECK ("מחיר_מכירה" IS NULL OR "מחיר_מכירה" >= 0);

-- Verify (read-only): should list the new column.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'עלויות_מוצרים' AND column_name = 'מחיר_מכירה';
