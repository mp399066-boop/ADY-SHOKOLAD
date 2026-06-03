// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATASET — 100% fake data for marketing recordings.
//
// Nothing here is real Adi data. No real phone numbers, emails, addresses,
// invoices, order notes, private messages, or business figures. All ids are
// "demo-*" so they can never collide with real rows, and this module is only
// ever consumed by the client-side demo interceptor (src/lib/demo/intercept.ts)
// — it is NEVER imported by a server route, so it can never reach the DB.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Customer, Order, Product, RawMaterial, Courier, DashboardStats,
} from '@/types/database';

// Today / tomorrow in Israel time — keeps the demo's "today" numbers honest
// on screen without importing date libs.
function israelISO(offsetDays = 0): string {
  const base = new Date();
  base.setDate(base.getDate() + offsetDays);
  return base.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

const TODAY = israelISO(0);
const TOMORROW = israelISO(1);
const NOW = new Date().toISOString();

// ─── Customers ───────────────────────────────────────────────────────────────
// The suggested demo customer (רבקה כהן) is first so it's easy to find.

export const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'demo-cust-1',
    שם_פרטי: 'רבקה', שם_משפחה: 'כהן',
    טלפון: '050-0000000', אימייל: 'demo@example.com',
    סוג_לקוח: 'חוזר', סטטוס_לקוח: 'פעיל',
    מקור_הגעה: 'המלצה', אחוז_הנחה: 5,
    הערות: 'לקוחה לדוגמה — נתוני הדגמה בלבד.',
    כתובת: 'רחוב הדגמה 1', עיר: 'תל אביב', הערות_כתובת: 'קומה 2, דירה 4',
    תאריך_יצירה: '2025-09-01T08:00:00.000Z', תאריך_עדכון: NOW,
  },
  {
    id: 'demo-cust-2',
    שם_פרטי: 'שרה', שם_משפחה: 'לוי',
    טלפון: '050-0000001', אימייל: 'demo2@example.com',
    סוג_לקוח: 'פרטי', סטטוס_לקוח: 'פעיל',
    מקור_הגעה: 'אינסטגרם', אחוז_הנחה: 0, הערות: null,
    כתובת: null, עיר: 'רמת גן', הערות_כתובת: null,
    תאריך_יצירה: '2025-10-12T08:00:00.000Z', תאריך_עדכון: NOW,
  },
  {
    id: 'demo-cust-3',
    שם_פרטי: 'מרים', שם_משפחה: 'פרידמן',
    טלפון: '050-0000002', אימייל: 'demo3@example.com',
    סוג_לקוח: 'עסקי - קבוע', סטטוס_לקוח: 'פעיל',
    מקור_הגעה: 'אתר', אחוז_הנחה: 10, הערות: null,
    כתובת: null, עיר: 'בני ברק', הערות_כתובת: null,
    תאריך_יצירה: '2025-08-05T08:00:00.000Z', תאריך_עדכון: NOW,
  },
  {
    id: 'demo-cust-4',
    שם_פרטי: 'חנה', שם_משפחה: 'רוזנברג',
    טלפון: '050-0000003', אימייל: 'demo4@example.com',
    סוג_לקוח: 'חוזר', סטטוס_לקוח: 'פעיל',
    מקור_הגעה: 'המלצה', אחוז_הנחה: 0, הערות: null,
    כתובת: null, עיר: 'ירושלים', הערות_כתובת: null,
    תאריך_יצירה: '2025-11-20T08:00:00.000Z', תאריך_עדכון: NOW,
  },
  {
    id: 'demo-cust-5',
    שם_פרטי: 'דבורה', שם_משפחה: 'אזולאי',
    טלפון: '050-0000004', אימייל: 'demo5@example.com',
    סוג_לקוח: 'פרטי', סטטוס_לקוח: 'פעיל',
    מקור_הגעה: 'פייסבוק', אחוז_הנחה: 0, הערות: null,
    כתובת: null, עיר: 'פתח תקווה', הערות_כתובת: null,
    תאריך_יצירה: '2026-01-08T08:00:00.000Z', תאריך_עדכון: NOW,
  },
];

// ─── Products ────────────────────────────────────────────────────────────────

function product(p: Partial<Product> & Pick<Product, 'id' | 'שם_מוצר' | 'מחיר'>): Product {
  return {
    סוג_מוצר: 'מוצר רגיל', פעיל: true, האם_צריך_בחירת_פטיפורים: false,
    לקוחות_עסקיים_בלבד: false, כמות_במארז: null, כמות_במלאי: 25,
    סף_מלאי_נמוך: 10, סף_מלאי_קריטי: 4, סטטוס_מלאי: 'תקין',
    sku: null, תיאור: null, תמונה_url: null, price_availability: 'retail',
    קטגוריית_מוצר: 'אחר', תאריך_יצירה: NOW, תאריך_עדכון: NOW,
    ...p,
  };
}

export const DEMO_PRODUCTS: Product[] = [
  product({ id: 'demo-prod-1', שם_מוצר: 'מארז פטיפורים 16 יחידות', מחיר: 180, סוג_מוצר: 'מארז פטיפורים', כמות_במארז: 16, קטגוריית_מוצר: 'מארז' }),
  product({ id: 'demo-prod-2', שם_מוצר: 'עוגת שוקולד אישית', מחיר: 220, קטגוריית_מוצר: 'עוגה' }),
  product({ id: 'demo-prod-3', שם_מוצר: 'קינוחי כוסות', מחיר: 90, קטגוריית_מוצר: 'קינוחים' }),
  product({ id: 'demo-prod-4', שם_מוצר: 'עוגיות חמאה', מחיר: 60, קטגוריית_מוצר: 'אחר' }),
  product({ id: 'demo-prod-5', שם_מוצר: 'מקרון צרפתי', מחיר: 120, כמות_במלאי: 8, סטטוס_מלאי: 'מלאי נמוך', קטגוריית_מוצר: 'אחר' }),
];

// ─── Raw materials (inventory) ───────────────────────────────────────────────

function raw(p: Partial<RawMaterial> & Pick<RawMaterial, 'id' | 'שם_חומר_גלם'>): RawMaterial {
  return {
    כמות_במלאי: 12, יחידת_מידה: 'ק"ג', סף_מלאי_נמוך: 5, סף_מלאי_קריטי: 2,
    סטטוס_מלאי: 'תקין', מחיר_ליחידה: 40, תאריך_תפוגה: null, הערות: null,
    ספק_מועדף_id: null, שם_מוצר_אצל_הספק: null, מקט_ספק: null,
    כמות_מינימום: 2, כמות_להזמנה: null, יחידת_קניה: null, הערות_רכש: null,
    תאריך_יצירה: NOW, תאריך_עדכון: NOW, ...p,
  };
}

export const DEMO_RAW_MATERIALS: RawMaterial[] = [
  raw({ id: 'demo-raw-1', שם_חומר_גלם: 'שוקולד מריר 70%', כמות_במלאי: 14, סטטוס_מלאי: 'תקין' }),
  raw({ id: 'demo-raw-2', שם_חומר_גלם: 'חמאה', כמות_במלאי: 3, סטטוס_מלאי: 'מלאי נמוך' }),
  raw({ id: 'demo-raw-3', שם_חומר_גלם: 'שמנת מתוקה', כמות_במלאי: 1, סטטוס_מלאי: 'קריטי', יחידת_מידה: 'ליטר' }),
  raw({ id: 'demo-raw-4', שם_חומר_גלם: 'קמח שקדים', כמות_במלאי: 9, סטטוס_מלאי: 'תקין' }),
  raw({ id: 'demo-raw-5', שם_חומר_גלם: 'סוכר', כמות_במלאי: 20, סטטוס_מלאי: 'תקין' }),
];

export const DEMO_COURIERS: Courier[] = [
  { id: 'demo-courier-1', שם_שליח: 'יוסי (שליח הדגמה)', טלפון_שליח: '050-0000010', אימייל_שליח: null, הערות: null, פעיל: true, created_at: NOW, updated_at: NOW },
];

// ─── Orders ──────────────────────────────────────────────────────────────────
// One detailed order for רבקה (used in the recorded flow) + a few light rows
// so the dashboard / orders list look populated.

function order(p: Partial<Order> & Pick<Order, 'id' | 'מספר_הזמנה' | 'לקוח_id'>): Order {
  return {
    ארכיון: false, סטטוס_הזמנה: 'חדשה', הזמנה_דחופה: false,
    תאריך_הזמנה: TODAY, תאריך_אספקה: TOMORROW, שעת_אספקה: '14:00',
    delivery_time_flexible: false, סוג_אספקה: 'משלוח',
    שם_מקבל: null, טלפון_מקבל: null, כתובת_מקבל_ההזמנה: null, עיר: null,
    הוראות_משלוח: null, דמי_משלוח: 30, delivery_recipient_type: 'customer',
    סוג_הזמנה: 'רגיל', satmar_summary_sent_at: null, אופן_תשלום: null,
    סטטוס_תשלום: 'ממתין', סוג_הנחה: 'ללא', ערך_הנחה: null,
    סכום_לפני_הנחה: null, סכום_הנחה: null, סך_הכל_לתשלום: null,
    זיכוי_בשימוש: 0, מקור_ההזמנה: 'הזמנה ידנית', ברכה_טקסט: null,
    הערות_להזמנה: null, תאריך_יצירה: NOW, תאריך_עדכון: NOW,
    summary_email_sent_at: null, summary_email_sent_total: null,
    summary_email_sent_items_snapshot: null,
    ...p,
  };
}

// The hero order for the recording — רבקה כהן, three demo products.
export const DEMO_PRIMARY_ORDER_ID = 'demo-order-1';

export const DEMO_ORDERS: Order[] = [
  order({
    id: DEMO_PRIMARY_ORDER_ID, מספר_הזמנה: 'DEMO-1001', לקוח_id: 'demo-cust-1',
    סטטוס_הזמנה: 'חדשה', סטטוס_תשלום: 'ממתין', הזמנה_דחופה: true,
    סכום_לפני_הנחה: 580, סכום_הנחה: 29, סך_הכל_לתשלום: 581,
    סוג_הנחה: 'אחוז', ערך_הנחה: 5,
    שם_מקבל: 'רבקה כהן', טלפון_מקבל: '050-0000000',
    כתובת_מקבל_ההזמנה: 'רחוב הדגמה 1', עיר: 'תל אביב',
    הערות_להזמנה: 'אריזת מתנה — נתוני הדגמה.',
    לקוחות: { ...DEMO_CUSTOMERS[0] },
  }),
  order({ id: 'demo-order-2', מספר_הזמנה: 'DEMO-1002', לקוח_id: 'demo-cust-3', סטטוס_הזמנה: 'בהכנה', סטטוס_תשלום: 'שולם', אופן_תשלום: 'כרטיס אשראי', סך_הכל_לתשלום: 420, תאריך_אספקה: TODAY, לקוחות: { ...DEMO_CUSTOMERS[2] } }),
  order({ id: 'demo-order-3', מספר_הזמנה: 'DEMO-1003', לקוח_id: 'demo-cust-4', סטטוס_הזמנה: 'מוכנה למשלוח', סטטוס_תשלום: 'שולם', אופן_תשלום: 'bit', סך_הכל_לתשלום: 260, תאריך_אספקה: TODAY, סוג_אספקה: 'איסוף עצמי', לקוחות: { ...DEMO_CUSTOMERS[3] } }),
  order({ id: 'demo-order-4', מספר_הזמנה: 'DEMO-1004', לקוח_id: 'demo-cust-2', סטטוס_הזמנה: 'נשלחה', סטטוס_תשלום: 'ממתין', סך_הכל_לתשלום: 340, תאריך_אספקה: TODAY, לקוחות: { ...DEMO_CUSTOMERS[1] } }),
  order({ id: 'demo-order-5', מספר_הזמנה: 'DEMO-1005', לקוח_id: 'demo-cust-5', סטטוס_הזמנה: 'חדשה', סטטוס_תשלום: 'ממתין', סך_הכל_לתשלום: 150, תאריך_אספקה: TOMORROW, לקוחות: { ...DEMO_CUSTOMERS[4] } }),
];

// Line items for the hero order — shaped like /api/orders/[id] returns them.
export const DEMO_PRIMARY_ORDER_ITEMS = [
  {
    id: 'demo-item-1', הזמנה_id: DEMO_PRIMARY_ORDER_ID, מוצר_id: 'demo-prod-1',
    סוג_שורה: 'מארז', שם_פריט_מותאם: null, גודל_מארז: 16, כמות: 1,
    מחיר_ליחידה: 180, סהכ: 180, הערות_לשורה: null,
    תאריך_יצירה: NOW, תאריך_עדכון: NOW,
    מוצרים_למכירה: { שם_מוצר: 'מארז פטיפורים 16 יחידות' },
    בחירת_פטיפורים_בהזמנה: [],
  },
  {
    id: 'demo-item-2', הזמנה_id: DEMO_PRIMARY_ORDER_ID, מוצר_id: 'demo-prod-2',
    סוג_שורה: 'מוצר', שם_פריט_מותאם: null, גודל_מארז: null, כמות: 1,
    מחיר_ליחידה: 220, סהכ: 220, הערות_לשורה: null,
    תאריך_יצירה: NOW, תאריך_עדכון: NOW,
    מוצרים_למכירה: { שם_מוצר: 'עוגת שוקולד אישית' },
    בחירת_פטיפורים_בהזמנה: [],
  },
  {
    id: 'demo-item-3', הזמנה_id: DEMO_PRIMARY_ORDER_ID, מוצר_id: 'demo-prod-3',
    סוג_שורה: 'מוצר', שם_פריט_מותאם: null, גודל_מארז: null, כמות: 2,
    מחיר_ליחידה: 90, סהכ: 180, הערות_לשורה: null,
    תאריך_יצירה: NOW, תאריך_עדכון: NOW,
    מוצרים_למכירה: { שם_מוצר: 'קינוחי כוסות' },
    בחירת_פטיפורים_בהזמנה: [],
  },
];

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export const DEMO_DASHBOARD_STATS: DashboardStats = {
  ordersToday: 7, ordersTomorrow: 4, urgentOrders: 2, unpaidOrders: 3,
  inPreparation: 2, readyForDelivery: 1, shipped: 1,
  lowInventory: 2, lowProductStock: 1, deliveriesToday: 3,
  unpaidAmount: 1240, deliveriesCollected: 1, deliveriesDelivered: 1,
  revenueToday: 3680,
};

// ─── Mutable in-memory store ─────────────────────────────────────────────────
// Status changes in the demo (e.g. "בהכנה") mutate this copy so the UI reflects
// the change on refresh. It lives only in the browser tab and is rebuilt on
// reload — it never persists anywhere.

export interface DemoStore {
  customers: Customer[];
  products: Product[];
  rawMaterials: RawMaterial[];
  couriers: Courier[];
  orders: Order[];
  primaryOrderItems: typeof DEMO_PRIMARY_ORDER_ITEMS;
  stats: DashboardStats;
}

let store: DemoStore | null = null;

export function getDemoStore(): DemoStore {
  if (!store) {
    store = {
      customers: DEMO_CUSTOMERS.map(c => ({ ...c })),
      products: DEMO_PRODUCTS.map(p => ({ ...p })),
      rawMaterials: DEMO_RAW_MATERIALS.map(r => ({ ...r })),
      couriers: DEMO_COURIERS.map(c => ({ ...c })),
      orders: DEMO_ORDERS.map(o => ({ ...o })),
      primaryOrderItems: DEMO_PRIMARY_ORDER_ITEMS.map(i => ({ ...i })),
      stats: { ...DEMO_DASHBOARD_STATS },
    };
  }
  return store;
}
