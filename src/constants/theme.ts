export const BRAND_COLORS = {
  primary: '#8B5E34',
  secondary: '#C7A46B',
  lightGold: '#E7D2A6',
  darkBrown: '#4A2F1B',
  cream: '#F6F3EE',
  card: '#FFFFFF',
  textPrimary: '#1C1008',
  textSecondary: '#7A6050',
  border: '#E8E0D4',
  success: '#2E7D32',
  warning: '#E6A800',
  danger: '#C0392B',
  info: '#2563EB',
} as const;

export const STATUS_COLORS: Record<string, string> = {
  חדשה: 'bg-sky-50 text-sky-700',
  בהכנה: 'bg-amber-50 text-amber-700',
  'מוכנה למשלוח': 'bg-violet-50 text-violet-700',
  נשלחה: 'bg-indigo-50 text-indigo-700',
  'הושלמה בהצלחה': 'bg-emerald-50 text-emerald-700',
  בוטלה: 'bg-rose-50 text-rose-600',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-amber-50 text-amber-700',
  שולם: 'bg-emerald-50 text-emerald-700',
  חלקי: 'bg-orange-50 text-orange-700',
  בוטל: 'bg-rose-50 text-rose-600',
};

export const INVENTORY_STATUS_COLORS: Record<string, string> = {
  תקין: 'bg-emerald-50 text-emerald-700',
  'מלאי נמוך': 'bg-amber-50 text-amber-700',
  קריטי: 'bg-orange-50 text-orange-700',
  'אזל מהמלאי': 'bg-rose-50 text-rose-600',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-stone-100 text-stone-600',
  'מוכן למשלוח': 'bg-violet-50 text-violet-700',
  'יצא למשלוח': 'bg-sky-50 text-sky-700',
  נמסר: 'bg-emerald-50 text-emerald-700',
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  פרטי: 'bg-stone-100 text-stone-600',
  חוזר: 'bg-sky-50 text-sky-700',
  VIP: 'bg-amber-50 text-amber-700',
  'מעצב אירועים': 'bg-violet-50 text-violet-700',
};
