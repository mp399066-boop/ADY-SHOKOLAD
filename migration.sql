-- ================================================================
-- עדי תכשיט שוקולד — Migration
-- הרץ את הקובץ הזה ב: Supabase Dashboard > SQL Editor
-- ================================================================

-- A. תאריך תפוגה לחומרי גלם
ALTER TABLE מלאי_חומרי_גלם
  ADD COLUMN IF NOT EXISTS תאריך_תפוגה DATE;

-- B. מלאי מוצרים מוגמרים
ALTER TABLE מוצרים_למכירה
  ADD COLUMN IF NOT EXISTS כמות_במלאי NUMERIC(10,2) NOT NULL DEFAULT 0;

-- C. מלאי פטיפורים
ALTER TABLE סוגי_פטיפורים
  ADD COLUMN IF NOT EXISTS כמות_במלאי NUMERIC(10,2) NOT NULL DEFAULT 0;

-- D. ארכיון הזמנות (soft archive)
ALTER TABLE הזמנות
  ADD COLUMN IF NOT EXISTS ארכיון BOOLEAN NOT NULL DEFAULT FALSE;

-- E. תיעוד תקשורת עם לקוח
CREATE TABLE IF NOT EXISTS תיעוד_תקשורת (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  מזהה_לובהבל  VARCHAR(12)  NOT NULL,
  לקוח_id      UUID         NOT NULL REFERENCES לקוחות(id) ON DELETE CASCADE,
  סוג          VARCHAR(20)  NOT NULL CHECK (סוג IN ('מייל', 'וואטסאפ')),
  תוכן         TEXT         NOT NULL,
  תאריך        TIMESTAMPTZ  DEFAULT NOW(),
  תאריך_יצירה  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_תיעוד_תקשורת_לקוח ON תיעוד_תקשורת(לקוח_id);

-- F. מחירון לפי סוג לקוח
CREATE TABLE IF NOT EXISTS מחירון (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  מזהה_לובהבל  VARCHAR(12)   NOT NULL,
  מוצר_id      UUID          NOT NULL REFERENCES מוצרים_למכירה(id) ON DELETE CASCADE,
  סוג_לקוח    VARCHAR(50)   NOT NULL,
  מחיר         NUMERIC(10,2) NOT NULL,
  תאריך_יצירה  TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (מוצר_id, סוג_לקוח)
);
