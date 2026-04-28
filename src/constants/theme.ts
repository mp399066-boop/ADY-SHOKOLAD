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
  חדשה: 'bg-blue-50 text-blue-700 border-blue-100',
  בהכנה: 'bg-amber-50 text-amber-700 border-amber-100',
  'מוכנה למשלוח': 'bg-purple-50 text-purple-700 border-purple-100',
  נשלחה: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'הושלמה בהצלחה': 'bg-green-50 text-green-700 border-green-100',
  בוטלה: 'bg-red-50 text-red-600 border-red-100',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  שולם: 'bg-green-50 text-green-700 border-green-100',
  חלקי: 'bg-orange-50 text-orange-700 border-orange-100',
  בוטל: 'bg-red-50 text-red-600 border-red-100',
};

export const INVENTORY_STATUS_COLORS: Record<string, string> = {
  תקין: 'bg-green-50 text-green-700 border-green-100',
  'מלאי נמוך': 'bg-yellow-50 text-yellow-700 border-yellow-100',
  קריטי: 'bg-orange-50 text-orange-700 border-orange-100',
  'אזל מהמלאי': 'bg-red-50 text-red-600 border-red-100',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-gray-50 text-gray-600 border-gray-100',
  'מוכן למשלוח': 'bg-purple-50 text-purple-700 border-purple-100',
  'יצא למשלוח': 'bg-blue-50 text-blue-700 border-blue-100',
  נמסר: 'bg-green-50 text-green-700 border-green-100',
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  פרטי: 'bg-gray-50 text-gray-600',
  חוזר: 'bg-blue-50 text-blue-700',
  VIP: 'bg-amber-50 text-amber-700',
  'מעצב אירועים': 'bg-purple-50 text-purple-700',
};
