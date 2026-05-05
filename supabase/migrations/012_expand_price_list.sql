-- 012: Extend מחירון table for Excel price-list import
-- Idempotent: CREATE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "מחירון" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "מוצר_id"      UUID REFERENCES "מוצרים_למכירה"(id) ON DELETE SET NULL,
  "סוג_לקוח"     TEXT,
  "מחיר"         NUMERIC(10,2) NOT NULL DEFAULT 0,
  "תאריך_יצירה"  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "מחירון"
  ADD COLUMN IF NOT EXISTS "sku"                   TEXT,
  ADD COLUMN IF NOT EXISTS "product_name_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "price_type"            TEXT
    CHECK ("price_type" IN ('retail', 'business_quantity', 'business_fixed')),
  ADD COLUMN IF NOT EXISTS "min_quantity"          INTEGER,
  ADD COLUMN IF NOT EXISTS "includes_vat"          BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "פעיל"                  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "uploaded_at"           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "תאריך_עדכון"           TIMESTAMPTZ DEFAULT now();

-- Auto-update תאריך_עדכון on every UPDATE (reuses existing trigger function)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_מחירון_updated_at'
  ) THEN
    CREATE TRIGGER update_מחירון_updated_at
      BEFORE UPDATE ON "מחירון"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
