-- Migration 037: Support for manually-issued Morning documents
-- Adds three optional columns to חשבוניות so the CRM can store records
-- that the operator created directly inside Morning (outside the CRM).
--
-- מקור:       'morning_api' (default, existing rows) | 'manual_morning'
-- הערה:       free-text note supplied by the operator
-- נוצר_על_ידי: email of the CRM user who marked it
--
-- All three use ADD COLUMN IF NOT EXISTS — safe to run twice.
-- Existing rows are unaffected (מקור defaults to 'morning_api').

ALTER TABLE "חשבוניות"
  ADD COLUMN IF NOT EXISTS "מקור"         TEXT    DEFAULT 'morning_api',
  ADD COLUMN IF NOT EXISTS "הערה"         TEXT,
  ADD COLUMN IF NOT EXISTS "נוצר_על_ידי"  TEXT;

-- Tag all existing rows as api-sourced so the UI can distinguish them.
UPDATE "חשבוניות"
  SET "מקור" = 'morning_api'
  WHERE "מקור" IS NULL;
