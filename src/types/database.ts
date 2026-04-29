export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      business_settings: {
        Row: BusinessSettings;
        Insert: Partial<BusinessSettings>;
        Update: Partial<BusinessSettings>;
      };
      לקוחות: {
        Row: Customer;
        Insert: Partial<Customer>;
        Update: Partial<Customer>;
      };
      הזמנות: {
        Row: Order;
        Insert: Partial<Order>;
        Update: Partial<Order>;
      };
      מוצרים_למכירה: {
        Row: Product;
        Insert: Partial<Product>;
        Update: Partial<Product>;
      };
      מוצרים_בהזמנה: {
        Row: OrderItem;
        Insert: Partial<OrderItem>;
        Update: Partial<OrderItem>;
      };
      מארזים: {
        Row: Package;
        Insert: Partial<Package>;
        Update: Partial<Package>;
      };
      סוגי_פטיפורים: {
        Row: PetitFourType;
        Insert: Partial<PetitFourType>;
        Update: Partial<PetitFourType>;
      };
      בחירת_פטיפורים_בהזמנה: {
        Row: PetitFourSelection;
        Insert: Partial<PetitFourSelection>;
        Update: Partial<PetitFourSelection>;
      };
      מלאי_חומרי_גלם: {
        Row: RawMaterial;
        Insert: Partial<RawMaterial>;
        Update: Partial<RawMaterial>;
      };
      מתכונים: {
        Row: Recipe;
        Insert: Partial<Recipe>;
        Update: Partial<Recipe>;
      };
      רכיבי_מתכון: {
        Row: RecipeIngredient;
        Insert: Partial<RecipeIngredient>;
        Update: Partial<RecipeIngredient>;
      };
      ייצור: {
        Row: Production;
        Insert: Partial<Production>;
        Update: Partial<Production>;
      };
      משלוחים: {
        Row: Delivery;
        Insert: Partial<Delivery>;
        Update: Partial<Delivery>;
      };
      תשלומים: {
        Row: Payment;
        Insert: Partial<Payment>;
        Update: Partial<Payment>;
      };
      חשבוניות: {
        Row: Invoice;
        Insert: Partial<Invoice>;
        Update: Partial<Invoice>;
      };
      uploaded_files: {
        Row: UploadedFile;
        Insert: Partial<UploadedFile>;
        Update: Partial<UploadedFile>;
      };
      תיעוד_תקשורת: {
        Row: CommunicationLog;
        Insert: Partial<CommunicationLog>;
        Update: Partial<CommunicationLog>;
      };
      מחירון: {
        Row: PriceListItem;
        Insert: Partial<PriceListItem>;
        Update: Partial<PriceListItem>;
      };
    };
  };
}

export interface BusinessSettings {
  id: string;
  business_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  default_currency: string | null;
  updated_at: string | null;
}

export interface Customer {
  id: string;
  שם_פרטי: string;
  שם_משפחה: string;
  טלפון: string | null;
  אימייל: string | null;
  סוג_לקוח: 'פרטי' | 'חוזר' | 'VIP' | 'מעצב אירועים';
  סטטוס_לקוח: string | null;
  מקור_הגעה: string | null;
  אחוז_הנחה: number | null;
  הערות: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
}

export interface Order {
  id: string;
  מספר_הזמנה: string;
  לקוח_id: string;
  ארכיון: boolean;
  סטטוס_הזמנה: 'חדשה' | 'בהכנה' | 'מוכנה למשלוח' | 'נשלחה' | 'הושלמה בהצלחה' | 'בוטלה';
  הזמנה_דחופה: boolean;
  תאריך_הזמנה: string;
  תאריך_אספקה: string | null;
  שעת_אספקה: string | null;
  סוג_אספקה: 'משלוח' | 'איסוף עצמי';
  שם_מקבל: string | null;
  טלפון_מקבל: string | null;
  כתובת_מקבל_ההזמנה: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  דמי_משלוח: number | null;
  אופן_תשלום: string | null;
  סטטוס_תשלום: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל';
  סכום_לפני_הנחה: number | null;
  סכום_הנחה: number | null;
  סך_הכל_לתשלום: number | null;
  מקור_ההזמנה: string | null;
  ברכה_טקסט: string | null;
  הערות_להזמנה: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
  לקוחות?: Customer;
}

export interface Product {
  id: string;
  שם_מוצר: string;
  סוג_מוצר: 'מוצר רגיל' | 'מארז פטיפורים';
  מחיר: number;
  פעיל: boolean;
  האם_צריך_בחירת_פטיפורים: boolean;
  כמות_במארז: number | null;
  כמות_במלאי: number;
  תיאור: string | null;
  תמונה_url: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
}

export interface OrderItem {
  id: string;
  הזמנה_id: string;
  מוצר_id: string | null;
  סוג_שורה: 'מוצר' | 'מארז';
  גודל_מארז: number | null;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
  מוצרים_למכירה?: Product;
  בחירת_פטיפורים_בהזמנה?: PetitFourSelection[];
}

export interface Package {
  id: string;
  שם_מארז: string;
  גודל_מארז: number;
  כמה_סוגים_מותר_לבחור: number;
  מחיר_מארז: number;
  פעיל: boolean;
  הערות: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
}

export interface PetitFourType {
  id: string;
  שם_פטיפור: string;
  פעיל: boolean;
  כמות_במלאי: number;
  הערות: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
}

export interface PetitFourSelection {
  id: string;
  שורת_הזמנה_id: string;
  פטיפור_id: string;
  כמות: number;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
  סוגי_פטיפורים?: PetitFourType;
}

export interface RawMaterial {
  id: string;
  שם_חומר_גלם: string;
  כמות_במלאי: number;
  יחידת_מידה: string;
  סף_מלאי_נמוך: number;
  סף_מלאי_קריטי: number;
  סטטוס_מלאי: 'תקין' | 'מלאי נמוך' | 'קריטי' | 'אזל מהמלאי';
  מחיר_ליחידה: number | null;
  תאריך_תפוגה: string | null;
  הערות: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
}

export interface Recipe {
  id: string;
  שם_מתכון: string;
  מוצר_id: string | null;
  כמות_תוצר: number;
  הערות: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
  מוצרים_למכירה?: Product;
  רכיבי_מתכון?: RecipeIngredient[];
}

export interface RecipeIngredient {
  id: string;
  מתכון_id: string;
  חומר_גלם_id: string;
  כמות_נדרשת: number;
  יחידת_מידה: string;
  מלאי_חומרי_גלם?: RawMaterial;
}

export interface Production {
  id: string;
  מוצר_id: string;
  כמות_שיוצרה: number;
  תאריך_ייצור: string;
  הערות: string | null;
  מוצרים_למכירה?: Product;
}

export interface Delivery {
  id: string;
  הזמנה_id: string;
  סטטוס_משלוח: 'ממתין' | 'בהכנה' | 'מוכן למשלוח' | 'יצא למשלוח' | 'בדרך' | 'נמסר' | 'נכשל';
  שם_שליח: string | null;
  טלפון_שליח: string | null;
  כתובת: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  תאריך_משלוח: string | null;
  שעת_משלוח: string | null;
  הערות: string | null;
  הזמנות?: Order;
  _noRecord?: boolean;
}

export interface Payment {
  id: string;
  הזמנה_id: string;
  סכום: number;
  אמצעי_תשלום: string;
  סטטוס_תשלום: string;
  תאריך_תשלום: string;
  קישור_תשלום: string | null;
  הערות: string | null;
  הזמנות?: Order;
}

export interface Invoice {
  id: string;
  הזמנה_id: string;
  לקוח_id: string;
  מספר_חשבונית: string;
  קישור_חשבונית: string | null;
  סכום: number;
  סטטוס: string;
  תאריך_יצירה: string;
  הזמנות?: Order;
  לקוחות?: Customer;
}

export interface UploadedFile {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  bucket: string;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface CommunicationLog {
  id: string;
  לקוח_id: string;
  סוג: 'מייל' | 'וואטסאפ';
  תוכן: string;
  תאריך: string;
  תאריך_יצירה: string;
  הזמנה_id?: string | null;
  כיוון?: string | null;
  נושא?: string | null;
  אל?: string | null;
  מ?: string | null;
  סטטוס?: string | null;
  מזהה_הודעה?: string | null;
  הודעת_שגיאה?: string | null;
}

export interface PriceListItem {
  id: string;
  מוצר_id: string;
  סוג_לקוח: string;
  מחיר: number;
  תאריך_יצירה: string;
  מוצרים_למכירה?: Product;
}

export interface DashboardStats {
  ordersToday: number;
  ordersTomorrow: number;
  urgentOrders: number;
  unpaidOrders: number;
  inPreparation: number;
  readyForDelivery: number;
  shipped: number;
  lowInventory: number;
  deliveriesToday: number;
  unpaidAmount: number;
}
