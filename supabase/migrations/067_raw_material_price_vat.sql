-- 067_raw_material_price_vat.sql
-- ---------------------------------------------------------------------------
-- מחיר חומר גלם — כולל מע"מ או לפני מע"מ.
--
-- The owner enters raw-material prices sometimes from a receipt (VAT
-- included) and sometimes from a supplier price list (before VAT). The
-- business gets the VAT back, so product cost (/costs, /profit) must use the
-- price BEFORE VAT. This flag says how the stored מחיר_ליחידה was entered:
--   false (default) — the price is before VAT → used as is (= the behaviour
--                     until now, so existing costs don't change);
--   true            — the price includes VAT → cost uses מחיר ÷ 1.18.
--
-- Run manually in Supabase SQL Editor (same as prior numbered migrations).
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

ALTER TABLE "מלאי_חומרי_גלם"
  ADD COLUMN IF NOT EXISTS "מחיר_כולל_מעמ" boolean NOT NULL DEFAULT false;

-- Verify (read-only): should list the new column.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'מלאי_חומרי_גלם' AND column_name = 'מחיר_כולל_מעמ';
