export const BRAND_COLORS = {
  primary: '#8B5E3C',
  secondary: '#C6A77D',
  lightGold: '#E7D5B8',
  darkBrown: '#5C3A1E',
  cream: '#F8F6F3',
  card: '#FFFFFF',
  textPrimary: '#2B2B2B',
  textSecondary: '#7A7A7A',
  border: '#E7E1D8',
  success: '#276749',
  warning: '#B45309',
  danger: '#BE3A2A',
  info: '#2563EB',
} as const;

export const STATUS_COLORS: Record<string, string> = {
  חדשה:               'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  בהכנה:              'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  'מוכנה למשלוח':     'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  נשלחה:              'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
  'הושלמה בהצלחה':    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  בוטלה:              'bg-red-50 text-red-600 ring-1 ring-red-100',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  שולם:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  חלקי:  'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
  בוטל:  'bg-red-50 text-red-600 ring-1 ring-red-100',
};

export const INVENTORY_STATUS_COLORS: Record<string, string> = {
  תקין:          'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  'מלאי נמוך':   'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  קריטי:         'bg-orange-50 text-orange-700 ring-1 ring-orange-100',
  'אזל מהמלאי':  'bg-red-50 text-red-600 ring-1 ring-red-100',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  נאסף: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  נמסר: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  פרטי:  'bg-stone-50 text-stone-600 ring-1 ring-stone-200',
  חוזר:  'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  עסקי:  'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
};
