-- Enforce at most one credit_used transaction per order.
-- This makes credit deduction idempotent: a duplicate submission returns
-- a 23505 unique-violation which the server treats as an already-recorded entry.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_זיכויי_לקוחות_order_credit_used"
  ON "זיכויי_לקוחות"("הזמנה_id")
  WHERE "סוג" = 'credit_used' AND "הזמנה_id" IS NOT NULL;
