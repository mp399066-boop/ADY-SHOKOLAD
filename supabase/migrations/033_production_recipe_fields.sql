-- Add direct recipe link and creator tracking to ייצור.
-- Enables recipe-based production (select recipe + batches) instead of
-- product-based only. Old rows keep מוצר_id; new rows set מתכון_id.

ALTER TABLE "ייצור"
  ADD COLUMN IF NOT EXISTS "מתכון_id"    UUID REFERENCES "מתכונים"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "נוצר_על_ידי" TEXT;
