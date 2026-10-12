import type { Order, OrderItem, OrderRecipient, Customer, Product } from '@/types/database';
// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface EditForm {
  הזמנה_דחופה: boolean;
  סוג_אספקה: 'משלוח' | 'איסוף עצמי';
  תאריך_אספקה: string;
  שעת_אספקה: string;
  delivery_time_flexible: boolean;
  מקור_ההזמנה: string;
  שם_מקבל: string;
  טלפון_מקבל: string;
  כתובת_מקבל_ההזמנה: string;
  עיר: string;
  הוראות_משלוח: string;
  דמי_משלוח: string;
  ברכה_טקסט: string;
  הערות_להזמנה: string;
  אופן_תשלום: string;
  סטטוס_תשלום: Order['סטטוס_תשלום'];
  סטטוס_הזמנה: Order['סטטוס_הזמנה'];
  סוג_הנחה: 'ללא' | 'אחוז' | 'סכום';
  ערך_הנחה: string;
  סוג_הזמנה: 'רגיל' | 'סאטמר';
}

export interface EditOrderItem {
  מוצר_id: string;
  שם_מוצר: string;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string;
  /** Recipient this line is for; '' = the order as a whole. */
  נמען_id?: string;
}

export interface EditPackageItem {
  _packageId: string;
  שם_מארז: string;
  גודל_מארז: number;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string;
  נמען_id?: string;
  פטיפורים: { פטיפור_id: string; שם: string; כמות: number }[];
}

export interface EditCustomItem {
  שם_פריט_מותאם: string;
  // UI-only: 'הנחה_תשלום' maps to 'תוספת_תשלום' with a negative מחיר_ליחידה on save.
  סוג_שורה: 'מוצר_ידני' | 'תוספת_תשלום' | 'הנחה_תשלום';
  כמות: number;
  מחיר_ליחידה: number;  // always positive in the editor; negated on save for הנחה_תשלום
  סהכ: number;           // negative for הנחה_תשלום rows
  הערות_לשורה: string;
  נמען_id?: string;
}

export type OrderDeliveryRow = {
  id?: string;
  סטטוס_משלוח: string;
  שם_שליח: string;
  כתובת?: string | null;
  עיר: string;
  courier_id?: string | null;
  נמען_id?: string | null;
  שליחים?: { id: string; שם_שליח: string; טלפון_שליח: string | null } | null;
};

export type FullOrder = Order & {
  לקוחות: Customer;
  מוצרים_בהזמנה: (OrderItem & { מוצרים_למכירה?: Product })[];
  משלוח: OrderDeliveryRow | null;
  /** Every stop of the order — one row per recipient on a multi-recipient order. */
  משלוחים?: OrderDeliveryRow[];
  /** The people this order is delivered to; empty on a classic single-stop order. */
  נמענים?: OrderRecipient[];
  תשלומים: { id: string; סכום: number; אמצעי_תשלום: string; תאריך_תשלום: string }[];
  חשבוניות: { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string; קישור_חשבונית?: string | null; סוג_מסמך?: string | null; תאריך_יצירה?: string | null }[];
};
