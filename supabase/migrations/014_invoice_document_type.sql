-- Migration 014: Add document type to חשבוניות
-- Required for Fix 1 (חשבונית מס on completion) + Fix 2 (קבלה on payment)
-- so idempotency can be checked per-type and both documents can coexist for one order.

ALTER TABLE "חשבוניות"
  ADD COLUMN IF NOT EXISTS "סוג_מסמך" TEXT DEFAULT 'חשבונית_מס_קבלה';

-- Tag existing rows as the combined type (they were created with Morning type 320)
UPDATE "חשבוניות"
  SET "סוג_מסמך" = 'חשבונית_מס_קבלה'
  WHERE "סוג_מסמך" IS NULL;
