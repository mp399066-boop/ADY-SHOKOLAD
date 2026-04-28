# מערכת ניהול פטיסרי - Patisserie CRM

מערכת CRM מלאה לניהול לקוחות, הזמנות, מוצרים, מלאי ומשלוחים לעסק שוקולד ופטיפורים.

---

## דרישות מקדימות

- Node.js 18+
- חשבון Supabase (https://supabase.com)

---

## הגדרה ראשונית

### 1. שכפל את הפרויקט
```bash
git clone <repo-url>
cd patisserie-system
npm install
```

### 2. הגדר Supabase

1. צור פרויקט חדש ב-[Supabase](https://app.supabase.com)
2. העתק את ה-URL ומפתחות ה-API מ Settings > API
3. צור את הקובץ `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### 3. הרץ את ה-Migrations

1. פתח את **SQL Editor** בפרויקט Supabase שלך
2. העתק את תוכן הקובץ `supabase/migrations/001_initial_schema.sql`
3. הדבק והרץ

### 4. צור Storage Buckets

ב-Supabase Dashboard > Storage, צור את ה-Buckets הבאים:

| שם Bucket | Public |
|---|---|
| `brand-assets` | כן |
| `customers-files` | לא |
| `orders-files` | לא |
| `product-images` | כן |
| `recipe-files` | לא |
| `invoice-files` | לא |

**לחלופין** - הרץ ב-SQL Editor:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('brand-assets', 'brand-assets', true),
  ('customers-files', 'customers-files', false),
  ('orders-files', 'orders-files', false),
  ('product-images', 'product-images', true),
  ('recipe-files', 'recipe-files', false),
  ('invoice-files', 'invoice-files', false)
ON CONFLICT DO NOTHING;
```

### 5. הרץ את הפרויקט

```bash
npm run dev
```

פתח http://localhost:3000 - תועבר אוטומטית ל-/dashboard

---

## מבנה הפרויקט

```
src/
├── app/
│   ├── (dashboard)/          # Layout עם sidebar
│   │   ├── dashboard/        # לוח בקרה
│   │   ├── orders/           # הזמנות
│   │   │   ├── new/          # הזמנה חדשה
│   │   │   └── [id]/         # פרטי הזמנה
│   │   ├── customers/        # לקוחות
│   │   │   ├── new/          # לקוח חדש
│   │   │   └── [id]/         # פרופיל לקוח
│   │   ├── products/         # מוצרים + מארזים + פטיפורים
│   │   ├── inventory/        # מלאי חומרי גלם
│   │   ├── recipes/          # מתכונים + ייצור
│   │   ├── deliveries/       # משלוחים
│   │   ├── invoices/         # חשבוניות
│   │   ├── import/           # ייבוא נתונים
│   │   └── settings/         # הגדרות עסק
│   └── api/                  # API Routes
│       ├── customers/
│       ├── orders/
│       │   └── create-full/  # יצירת הזמנה מלאה
│       ├── products/
│       ├── packages/
│       ├── petit-four-types/
│       ├── inventory/
│       ├── recipes/
│       ├── production/
│       ├── deliveries/
│       ├── invoices/
│       ├── settings/
│       ├── upload/
│       ├── import/
│       └── dashboard/
├── components/
│   ├── layout/               # Sidebar, TopBar
│   └── ui/                   # Button, Card, Input, Modal, Badge...
├── constants/
│   └── theme.ts              # צבעי המותג
├── lib/
│   ├── supabase/             # Client/Server clients
│   └── utils.ts              # פונקציות עזר
└── types/
    └── database.ts           # TypeScript types
```

---

## ממשק ה-API

| Method | URL | תיאור |
|---|---|---|
| GET/POST | `/api/customers` | רשימת לקוחות / לקוח חדש |
| GET/PATCH | `/api/customers/[id]` | לקוח ספציפי |
| GET/POST | `/api/orders` | רשימת הזמנות |
| GET/PATCH | `/api/orders/[id]` | הזמנה ספציפית |
| POST | `/api/orders/create-full` | יצירת הזמנה מלאה עם מוצרים ומשלוח |
| GET/POST | `/api/products` | מוצרים |
| PATCH | `/api/products/[id]` | עדכון מוצר |
| GET/POST | `/api/packages` | מארזים |
| GET/POST | `/api/petit-four-types` | סוגי פטיפורים |
| GET/POST | `/api/inventory` | מלאי |
| PATCH | `/api/inventory/[id]` | עדכון מלאי |
| GET/POST | `/api/recipes` | מתכונים |
| GET/POST | `/api/production` | ייצור (מפחית מלאי) |
| GET/POST | `/api/deliveries` | משלוחים |
| PATCH | `/api/deliveries/[id]` | עדכון סטטוס משלוח |
| GET/POST | `/api/invoices` | חשבוניות |
| GET/PATCH | `/api/settings` | הגדרות עסק |
| POST | `/api/upload` | העלאת קבצים |
| POST | `/api/import` | ייבוא נתונים (CSV/XLSX/JSON) |
| GET | `/api/dashboard` | נתוני לוח הבקרה |

---

## דגמת API - יצירת הזמנה מלאה

```json
POST /api/orders/create-full
{
  "לקוח": { "id": "uuid-of-existing-customer" },
  "הזמנה": {
    "הזמנה_דחופה": false,
    "תאריך_אספקה": "2024-12-25",
    "שעת_אספקה": "14:00",
    "סוג_אספקה": "משלוח",
    "שם_מקבל": "ישראל ישראלי",
    "טלפון_מקבל": "050-1234567",
    "כתובת_מקבל_ההזמנה": "רחוב הרצל 1",
    "עיר": "תל אביב",
    "אופן_תשלום": "bit",
    "סטטוס_תשלום": "ממתין",
    "ברכה_טקסט": "מזל טוב!"
  },
  "מוצרים": [
    { "מוצר_id": "product-uuid", "כמות": 2, "מחיר_ליחידה": 45.00 }
  ],
  "מארזי_פטיפורים": [
    {
      "גודל_מארז": 12,
      "כמות": 1,
      "מחיר_ליחידה": 120.00,
      "פטיפורים": [
        { "פטיפור_id": "pf-uuid-1", "כמות": 6 },
        { "פטיפור_id": "pf-uuid-2", "כמות": 6 }
      ]
    }
  ],
  "משלוח": {
    "כתובת": "רחוב הרצל 1",
    "עיר": "תל אביב"
  }
}
```

---

## פיצ'רים עיקריים

- **לוח בקרה** - סטטיסטיקות עסקיות בזמן אמת
- **ניהול הזמנות** - יצירה, עדכון, מעקב מלא
- **מארזי פטיפורים** - בחירת סוגי פטיפורים לכל מארז
- **CRM לקוחות** - פרופיל מלא, היסטוריית הזמנות
- **מלאי** - ניטור ועדכון עם התראות אוטומטיות
- **מתכונים** - ניהול רכיבים, ייצור עם ניכוי מלאי אוטומטי
- **משלוחים** - מעקב לפי תאריך וסטטוס
- **ייבוא נתונים** - CSV, Excel, JSON עם upsert
- **הגדרות** - לוגו, צבעים, פרטי עסק
- **RTL מלא** - ממשק עברי מלא

---

## בניה לפרודקשן

```bash
npm run build
npm run start
```
