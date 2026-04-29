-- Add business-only flag to products
ALTER TABLE "מוצרים_למכירה"
  ADD COLUMN IF NOT EXISTS "לקוחות_עסקיים_בלבד" BOOLEAN NOT NULL DEFAULT false;

-- Extend customer type check constraint to include 'עסקי'
ALTER TABLE "לקוחות"
  DROP CONSTRAINT IF EXISTS "לקוחות_סוג_לקוח_check";

ALTER TABLE "לקוחות"
  ADD CONSTRAINT "לקוחות_סוג_לקוח_check"
  CHECK ("סוג_לקוח" IN ('פרטי', 'חוזר', 'עסקי'));
