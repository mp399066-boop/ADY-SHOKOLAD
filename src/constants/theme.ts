export const BRAND_COLORS = {
  primary: '#8B5E34',
  secondary: '#C7A46B',
  lightGold: '#E7D2A6',
  darkBrown: '#4A2F1B',
  cream: '#FAF7F0',
  card: '#FFFFFF',
  textPrimary: '#2B1A10',
  textSecondary: '#6B4A2D',
  success: '#2E7D32',
  warning: '#F2A900',
  danger: '#C0392B',
  info: '#2563EB',
} as const;

export const STATUS_COLORS: Record<string, string> = {
  חדשה: 'bg-blue-100 text-blue-800 border-blue-200',
  בהכנה: 'bg-amber-100 text-amber-800 border-amber-200',
  'מוכנה למשלוח': 'bg-purple-100 text-purple-800 border-purple-200',
  נשלחה: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'הושלמה בהצלחה': 'bg-green-100 text-green-800 border-green-200',
  בוטלה: 'bg-red-100 text-red-800 border-red-200',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  שולם: 'bg-green-100 text-green-800 border-green-200',
  חלקי: 'bg-orange-100 text-orange-800 border-orange-200',
  בוטל: 'bg-red-100 text-red-800 border-red-200',
};

export const INVENTORY_STATUS_COLORS: Record<string, string> = {
  תקין: 'bg-green-100 text-green-800 border-green-200',
  'מלאי נמוך': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  קריטי: 'bg-orange-100 text-orange-800 border-orange-200',
  'אזל מהמלאי': 'bg-red-100 text-red-800 border-red-200',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  ממתין: 'bg-gray-100 text-gray-800 border-gray-200',
  'מוכן למשלוח': 'bg-purple-100 text-purple-800 border-purple-200',
  'יצא למשלוח': 'bg-blue-100 text-blue-800 border-blue-200',
  נמסר: 'bg-green-100 text-green-800 border-green-200',
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  פרטי: 'bg-gray-100 text-gray-700',
  חוזר: 'bg-blue-100 text-blue-700',
  VIP: 'bg-yellow-100 text-yellow-700',
  'מעצב אירועים': 'bg-purple-100 text-purple-700',
};
