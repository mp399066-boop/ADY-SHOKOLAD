-- ============================================================================
-- Migration 024: Optional SKU on the product catalog.
--
-- Until now the SKU lived only on מחירון rows (per price-list entry). The
-- "מוצר חדש" modal in /orders/new tried to write a top-level sku to
-- מוצרים_למכירה, which has no such column — so every new-product save
-- crashed with column-not-found regardless of whether the user typed an SKU.
--
-- Adds a nullable text sku to מוצרים_למכירה. Auto-generated codes (PRD101+)
-- written by the app are guaranteed unique by a partial unique index that
-- ignores NULLs — so existing products with no SKU stay untouched and don't
-- collide with each other.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

-- 1. The column itself.
ALTER TABLE "מוצרים_למכירה"
  ADD COLUMN IF NOT EXISTS "sku" TEXT;

-- 2. Partial unique index — applies only to non-NULL values, so existing rows
--    (all NULL today) stay valid and we still get a hard guarantee against
--    accidental duplicate codes from the auto-generator.
CREATE UNIQUE INDEX IF NOT EXISTS "מוצרים_למכירה_sku_unique"
  ON "מוצרים_למכירה" ("sku")
  WHERE "sku" IS NOT NULL;

-- 3. Verify.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'מוצרים_למכירה' AND column_name = 'sku';
