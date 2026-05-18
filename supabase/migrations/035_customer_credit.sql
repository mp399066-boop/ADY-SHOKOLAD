-- Customer credit transactions
-- Each row is a signed ledger entry: positive = credit added, negative = credit used.
-- Current balance = SUM(סכום) for the customer.

CREATE TABLE IF NOT EXISTS "זיכויי_לקוחות" (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "לקוח_id"         UUID        NOT NULL REFERENCES "לקוחות"(id) ON DELETE CASCADE,
  "סכום"            NUMERIC(10,2) NOT NULL,
  "סוג"             TEXT        NOT NULL
    CHECK ("סוג" IN ('credit_added', 'credit_used', 'credit_adjustment')),
  "סיבה"            TEXT,
  "הזמנה_id"        UUID        REFERENCES "הזמנות"(id) ON DELETE SET NULL,
  "נוצר_על_ידי"     TEXT,
  "תאריך_יצירה"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "זיכויי_לקוחות" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_זיכויי_לקוחות_לקוח_id"
  ON "זיכויי_לקוחות"("לקוח_id");

-- Track how much credit was applied when creating an order.
-- סך_הכל_לתשלום already reflects the net amount (after credit deduction),
-- so זיכוי_בשימוש is for display/audit only.
ALTER TABLE "הזמנות"
  ADD COLUMN IF NOT EXISTS "זיכוי_בשימוש" NUMERIC(10,2) NOT NULL DEFAULT 0;
