-- Simplify customer types: keep only פרטי, חוזר, עסקי
-- Convert existing records before updating the constraint
UPDATE "לקוחות" SET "סוג_לקוח" = 'חוזר' WHERE "סוג_לקוח" = 'VIP';
UPDATE "לקוחות" SET "סוג_לקוח" = 'עסקי' WHERE "סוג_לקוח" = 'מעצב אירועים';

-- Drop old constraint (from migration 006 or earlier)
ALTER TABLE "לקוחות"
  DROP CONSTRAINT IF EXISTS "לקוחות_סוג_לקוח_check";

-- Add new constraint with only 3 allowed types
ALTER TABLE "לקוחות"
  ADD CONSTRAINT "לקוחות_סוג_לקוח_check"
  CHECK ("סוג_לקוח" IN ('פרטי', 'חוזר', 'עסקי'));
