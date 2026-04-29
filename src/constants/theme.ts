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
  חדשה:               'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
  בהכנה:              'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  'מוכנה למשלוח':     'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
  נשלחה:              'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
  'הושלמה בהצלחה':    'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  בוטלה:              'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  שולם:  'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  חלקי:  'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  בוטל:  'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
};

export const INVENTORY_STATUS_COLORS: Record<string, string> = {
  תקין:          'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  'מלאי נמוך':   'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  קריטי:         'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
  'אזל מהמלאי':  'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  נאסף: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  נמסר: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  פרטי:            'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
  חוזר:  'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
  עסקי:  'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
};
