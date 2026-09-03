-- ============================================================================
-- Migration 051: Customer ID number (מספר זהות).
--
-- Adds an optional מספר_זהות column to לקוחות for the customer's national ID
-- number. Nullable with no default — existing rows stay untouched.
-- ============================================================================

ALTER TABLE "לקוחות"
  ADD COLUMN IF NOT EXISTS "מספר_זהות" TEXT;

-- Verify (read-only). Should list the new column.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'לקוחות'
   AND column_name = 'מספר_זהות';
