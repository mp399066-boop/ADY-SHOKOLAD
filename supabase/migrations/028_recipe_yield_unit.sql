-- ============================================================================
-- 028 — Recipe yield unit (for the multi-sheet recipe import flow)
-- ============================================================================
-- The recipe import workbook carries a "יחידת תפוקה" header that the existing
-- schema doesn't have a column for (current schema has כמות_תוצר as a number
-- but no unit). Adding it here so the import can persist the unit faithfully
-- without stuffing it into הערות.
--
-- Idempotent — safe to run twice. No backfill needed; the column is nullable.
-- ============================================================================

ALTER TABLE "מתכונים"
  ADD COLUMN IF NOT EXISTS "יחידת_תפוקה" TEXT;

-- Recipe code = "מזהה_לובהבל" already exists with a UNIQUE constraint
-- (set in migration 001, NOT NULL relaxed in migration 009). The import
-- uses that field as "קוד מתכון" — no new column needed there.
