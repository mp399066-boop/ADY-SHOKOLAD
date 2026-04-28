export const BRAND_COLORS = {
  primary: '#7C5230',
  secondary: '#B8955A',
  lightGold: '#DFC89A',
  darkBrown: '#3E2510',
  cream: '#F5F1EB',
  card: '#FFFFFF',
  textPrimary: '#1E120A',
  textSecondary: '#6A4A38',
  border: '#D4C4AE',
  success: '#2E7D32',
  warning: '#E6A800',
  danger: '#C0392B',
  info: '#2563EB',
} as const;

export const STATUS_COLORS: Record<string, string> = {
  חדשה: 'bg-sky-100 text-sky-800',
  בהכנה: 'bg-amber-100 text-amber-800',
  'מוכנה למשלוח': 'bg-violet-100 text-violet-800',
  נשלחה: 'bg-indigo-100 text-indigo-800',
  'הושלמה בהצלחה': 'bg-emerald-100 text-emerald-800',
  בוטלה: 'bg-rose-100 text-rose-700',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-amber-100 text-amber-800',
  שולם: 'bg-emerald-100 text-emerald-800',
  חלקי: 'bg-orange-100 text-orange-800',
  בוטל: 'bg-rose-100 text-rose-700',
};

export const INVENTORY_STATUS_COLORS: Record<string, string> = {
  תקין: 'bg-emerald-100 text-emerald-800',
  'מלאי נמוך': 'bg-amber-100 text-amber-800',
  קריטי: 'bg-orange-100 text-orange-800',
  'אזל מהמלאי': 'bg-rose-100 text-rose-700',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-stone-200 text-stone-700',
  'מוכן למשלוח': 'bg-violet-100 text-violet-800',
  'יצא למשלוח': 'bg-sky-100 text-sky-800',
  נמסר: 'bg-emerald-100 text-emerald-800',
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  פרטי: 'bg-stone-200 text-stone-700',
  חוזר: 'bg-sky-100 text-sky-800',
  VIP: 'bg-amber-100 text-amber-800',
  'מעצב אירועים': 'bg-violet-100 text-violet-800',
};
