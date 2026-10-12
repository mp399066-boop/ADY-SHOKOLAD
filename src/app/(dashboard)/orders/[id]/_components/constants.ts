// ─── Constants ────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה'];

export const STATUS_PILL: Record<string, string> = {
  'חדשה':             'bg-sky-100 text-sky-800 ring-1 ring-sky-300',
  'בהכנה':            'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  'מוכנה למשלוח':     'bg-violet-100 text-violet-800 ring-1 ring-violet-300',
  'נשלחה':            'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300',
  'הושלמה בהצלחה':    'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  'בוטלה':            'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
};

export const PAYMENT_PILL: Record<string, string> = {
  'ממתין': 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  'שולם':  'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  'חלקי':  'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
  'בוטל':  'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
};

// Static (non-API) PayPlus payment page — a fixed 0/open-amount link where the
// customer fills in name, phone, order number and amount manually. Used while
// the PayPlus REST API is not yet enabled for the account.
export const PAYPLUS_STATIC_LINK = process.env.NEXT_PUBLIC_PAYPLUS_STATIC_PAYMENT_LINK ?? '';
// The API-generated per-order link button is hidden by default because the
// account currently lacks REST API permission (generateLink returns 422). Set
// NEXT_PUBLIC_PAYPLUS_API_ENABLED=true once PayPlus enables API access.
export const PAYPLUS_API_ENABLED = process.env.NEXT_PUBLIC_PAYPLUS_API_ENABLED === 'true';
