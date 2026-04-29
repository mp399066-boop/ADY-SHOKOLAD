-- ============================================================
-- Patisserie CRM - Initial Schema Migration
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- business_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#8B5E34',
  secondary_color TEXT DEFAULT '#C7A46B',
  phone TEXT,
  email TEXT,
  address TEXT,
  default_currency TEXT DEFAULT '₪',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO business_settings (business_name, default_currency)
VALUES ('הפטיסרי שלי', '₪')
ON CONFLICT DO NOTHING;

-- ============================================================
-- לקוחות (Customers)
-- ============================================================
CREATE TABLE IF NOT EXISTS לקוחות (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שם_פרטי TEXT NOT NULL,
  שם_משפחה TEXT NOT NULL DEFAULT '',
  טלפון TEXT,
  אימייל TEXT,
  סוג_לקוח TEXT NOT NULL DEFAULT 'פרטי' CHECK (סוג_לקוח IN ('פרטי', 'חוזר', 'עסקי')),
  סטטוס_לקוח TEXT DEFAULT 'פעיל',
  מקור_הגעה TEXT,
  אחוז_הנחה NUMERIC(5,2) DEFAULT 0,
  הערות TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_לקוחות_מזהה ON לקוחות(מזהה_לובהבל);
CREATE INDEX IF NOT EXISTS idx_לקוחות_טלפון ON לקוחות(טלפון);

-- ============================================================
-- הזמנות (Orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS הזמנות (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  מספר_הזמנה TEXT UNIQUE NOT NULL,
  לקוח_id UUID NOT NULL REFERENCES לקוחות(id) ON DELETE RESTRICT,
  סטטוס_הזמנה TEXT NOT NULL DEFAULT 'חדשה' CHECK (סטטוס_הזמנה IN ('חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה')),
  הזמנה_דחופה BOOLEAN DEFAULT FALSE,
  תאריך_הזמנה DATE NOT NULL DEFAULT CURRENT_DATE,
  תאריך_אספקה DATE,
  שעת_אספקה TEXT,
  סוג_אספקה TEXT DEFAULT 'משלוח' CHECK (סוג_אספקה IN ('משלוח', 'איסוף עצמי')),
  שם_מקבל TEXT,
  טלפון_מקבל TEXT,
  כתובת_מקבל_ההזמנה TEXT,
  עיר TEXT,
  הוראות_משלוח TEXT,
  דמי_משלוח NUMERIC(10,2) DEFAULT 0,
  אופן_תשלום TEXT,
  סטטוס_תשלום TEXT DEFAULT 'ממתין' CHECK (סטטוס_תשלום IN ('ממתין', 'שולם', 'חלקי', 'בוטל')),
  סכום_לפני_הנחה NUMERIC(10,2) DEFAULT 0,
  סכום_הנחה NUMERIC(10,2) DEFAULT 0,
  סך_הכל_לתשלום NUMERIC(10,2) DEFAULT 0,
  מקור_ההזמנה TEXT,
  ברכה_טקסט TEXT,
  הערות_להזמנה TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_הזמנות_לקוח ON הזמנות(לקוח_id);
CREATE INDEX IF NOT EXISTS idx_הזמנות_תאריך_אספקה ON הזמנות(תאריך_אספקה);
CREATE INDEX IF NOT EXISTS idx_הזמנות_סטטוס ON הזמנות(סטטוס_הזמנה);
CREATE INDEX IF NOT EXISTS idx_הזמנות_מזהה ON הזמנות(מזהה_לובהבל);

-- ============================================================
-- מוצרים_למכירה (Products)
-- ============================================================
CREATE TABLE IF NOT EXISTS מוצרים_למכירה (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שם_מוצר TEXT NOT NULL,
  סוג_מוצר TEXT NOT NULL DEFAULT 'מוצר רגיל' CHECK (סוג_מוצר IN ('מוצר רגיל', 'מארז פטיפורים')),
  מחיר NUMERIC(10,2) NOT NULL DEFAULT 0,
  פעיל BOOLEAN DEFAULT TRUE,
  האם_צריך_בחירת_פטיפורים BOOLEAN DEFAULT FALSE,
  כמות_במארז NUMERIC(10,0),
  תיאור TEXT,
  תמונה_url TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- מוצרים_בהזמנה (Order Items)
-- ============================================================
CREATE TABLE IF NOT EXISTS מוצרים_בהזמנה (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  הזמנה_id UUID NOT NULL REFERENCES הזמנות(id) ON DELETE CASCADE,
  מוצר_id UUID REFERENCES מוצרים_למכירה(id) ON DELETE SET NULL,
  סוג_שורה TEXT NOT NULL DEFAULT 'מוצר' CHECK (סוג_שורה IN ('מוצר', 'מארז')),
  גודל_מארז NUMERIC(10,0),
  כמות NUMERIC(10,2) NOT NULL DEFAULT 1,
  מחיר_ליחידה NUMERIC(10,2) NOT NULL DEFAULT 0,
  סהכ NUMERIC(10,2) NOT NULL DEFAULT 0,
  הערות_לשורה TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_מוצרים_בהזמנה_הזמנה ON מוצרים_בהזמנה(הזמנה_id);

-- ============================================================
-- מארזים (Package Catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS מארזים (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שם_מארז TEXT NOT NULL,
  גודל_מארז NUMERIC(10,0) NOT NULL,
  כמה_סוגים_מותר_לבחור NUMERIC(10,0) NOT NULL DEFAULT 1,
  מחיר_מארז NUMERIC(10,2) NOT NULL DEFAULT 0,
  פעיל BOOLEAN DEFAULT TRUE,
  הערות TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- סוגי_פטיפורים (Petit-Four Types)
-- ============================================================
CREATE TABLE IF NOT EXISTS סוגי_פטיפורים (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שם_פטיפור TEXT NOT NULL,
  פעיל BOOLEAN DEFAULT TRUE,
  הערות TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- בחירת_פטיפורים_בהזמנה (Petit-Four Selections in Order)
-- ============================================================
CREATE TABLE IF NOT EXISTS בחירת_פטיפורים_בהזמנה (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שורת_הזמנה_id UUID NOT NULL REFERENCES מוצרים_בהזמנה(id) ON DELETE CASCADE,
  פטיפור_id UUID NOT NULL REFERENCES סוגי_פטיפורים(id) ON DELETE RESTRICT,
  כמות NUMERIC(10,2) NOT NULL DEFAULT 1,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_בחירת_פטיפורים_שורה ON בחירת_פטיפורים_בהזמנה(שורת_הזמנה_id);

-- ============================================================
-- מלאי_חומרי_גלם (Raw Materials Inventory)
-- ============================================================
CREATE TABLE IF NOT EXISTS מלאי_חומרי_גלם (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שם_חומר_גלם TEXT NOT NULL,
  כמות_במלאי NUMERIC(10,3) NOT NULL DEFAULT 0,
  יחידת_מידה TEXT NOT NULL DEFAULT 'ק"ג',
  סף_מלאי_נמוך NUMERIC(10,3) NOT NULL DEFAULT 0,
  סף_מלאי_קריטי NUMERIC(10,3) NOT NULL DEFAULT 0,
  סטטוס_מלאי TEXT DEFAULT 'תקין' CHECK (סטטוס_מלאי IN ('תקין', 'מלאי נמוך', 'קריטי', 'אזל מהמלאי')),
  מחיר_ליחידה NUMERIC(10,2),
  הערות TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- מתכונים (Recipes)
-- ============================================================
CREATE TABLE IF NOT EXISTS מתכונים (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מזהה_לובהבל TEXT UNIQUE NOT NULL,
  שם_מתכון TEXT NOT NULL,
  מוצר_id UUID REFERENCES מוצרים_למכירה(id) ON DELETE SET NULL,
  כמות_תוצר NUMERIC(10,2) NOT NULL DEFAULT 1,
  הערות TEXT,
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW(),
  תאריך_עדכון TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- רכיבי_מתכון (Recipe Ingredients)
-- ============================================================
CREATE TABLE IF NOT EXISTS רכיבי_מתכון (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מתכון_id UUID NOT NULL REFERENCES מתכונים(id) ON DELETE CASCADE,
  חומר_גלם_id UUID NOT NULL REFERENCES מלאי_חומרי_גלם(id) ON DELETE RESTRICT,
  כמות_נדרשת NUMERIC(10,3) NOT NULL,
  יחידת_מידה TEXT NOT NULL
);

-- ============================================================
-- ייצור (Production)
-- ============================================================
CREATE TABLE IF NOT EXISTS ייצור (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  מוצר_id UUID REFERENCES מוצרים_למכירה(id) ON DELETE SET NULL,
  כמות_שיוצרה NUMERIC(10,2) NOT NULL,
  תאריך_ייצור DATE NOT NULL DEFAULT CURRENT_DATE,
  הערות TEXT
);

-- ============================================================
-- משלוחים (Deliveries)
-- ============================================================
CREATE TABLE IF NOT EXISTS משלוחים (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  הזמנה_id UUID NOT NULL REFERENCES הזמנות(id) ON DELETE CASCADE,
  סטטוס_משלוח TEXT DEFAULT 'ממתין' CHECK (סטטוס_משלוח IN ('ממתין', 'מוכן למשלוח', 'יצא למשלוח', 'נמסר')),
  שם_שליח TEXT,
  טלפון_שליח TEXT,
  כתובת TEXT,
  עיר TEXT,
  הוראות_משלוח TEXT,
  תאריך_משלוח DATE,
  שעת_משלוח TEXT,
  הערות TEXT
);

CREATE INDEX IF NOT EXISTS idx_משלוחים_הזמנה ON משלוחים(הזמנה_id);
CREATE INDEX IF NOT EXISTS idx_משלוחים_תאריך ON משלוחים(תאריך_משלוח);

-- ============================================================
-- תשלומים (Payments)
-- ============================================================
CREATE TABLE IF NOT EXISTS תשלומים (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  הזמנה_id UUID NOT NULL REFERENCES הזמנות(id) ON DELETE CASCADE,
  סכום NUMERIC(10,2) NOT NULL,
  אמצעי_תשלום TEXT NOT NULL DEFAULT 'מזומן',
  סטטוס_תשלום TEXT DEFAULT 'ממתין',
  תאריך_תשלום DATE NOT NULL DEFAULT CURRENT_DATE,
  קישור_תשלום TEXT,
  הערות TEXT
);

CREATE INDEX IF NOT EXISTS idx_תשלומים_הזמנה ON תשלומים(הזמנה_id);

-- ============================================================
-- חשבוניות (Invoices)
-- ============================================================
CREATE TABLE IF NOT EXISTS חשבוניות (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  הזמנה_id UUID NOT NULL REFERENCES הזמנות(id) ON DELETE CASCADE,
  לקוח_id UUID NOT NULL REFERENCES לקוחות(id) ON DELETE CASCADE,
  מספר_חשבונית TEXT NOT NULL,
  קישור_חשבונית TEXT,
  סכום NUMERIC(10,2) NOT NULL,
  סטטוס TEXT DEFAULT 'פתוחה',
  תאריך_יצירה TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- uploaded_files
-- ============================================================
CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  bucket TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_entity ON uploaded_files(entity_type, entity_id);

-- ============================================================
-- Update timestamp trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.תאריך_עדכון = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with תאריך_עדכון
CREATE TRIGGER update_לקוחות_updated_at BEFORE UPDATE ON לקוחות
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_הזמנות_updated_at BEFORE UPDATE ON הזמנות
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_מוצרים_למכירה_updated_at BEFORE UPDATE ON מוצרים_למכירה
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_מוצרים_בהזמנה_updated_at BEFORE UPDATE ON מוצרים_בהזמנה
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_מארזים_updated_at BEFORE UPDATE ON מארזים
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_מלאי_updated_at BEFORE UPDATE ON מלאי_חומרי_גלם
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Inventory status update function
-- ============================================================
CREATE OR REPLACE FUNCTION update_inventory_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.כמות_במלאי <= 0 THEN
    NEW.סטטוס_מלאי = 'אזל מהמלאי';
  ELSIF NEW.כמות_במלאי <= NEW.סף_מלאי_קריטי THEN
    NEW.סטטוס_מלאי = 'קריטי';
  ELSIF NEW.כמות_במלאי <= NEW.סף_מלאי_נמוך THEN
    NEW.סטטוס_מלאי = 'מלאי נמוך';
  ELSE
    NEW.סטטוס_מלאי = 'תקין';
  END IF;
  NEW.תאריך_עדכון = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_status_trigger
  BEFORE INSERT OR UPDATE ON מלאי_חומרי_גלם
  FOR EACH ROW EXECUTE FUNCTION update_inventory_status();

-- ============================================================
-- Storage buckets (run in Supabase dashboard or via API)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('customers-files', 'customers-files', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('orders-files', 'orders-files', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('recipe-files', 'recipe-files', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-files', 'invoice-files', false) ON CONFLICT DO NOTHING;
