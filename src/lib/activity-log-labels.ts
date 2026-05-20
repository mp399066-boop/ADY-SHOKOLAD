// Client-safe types + Hebrew label maps for system_activity_logs.
//
// Lives separately from `activity-log.ts` because that file pulls in the
// Supabase server client (which itself imports `next/headers`) and so cannot
// be imported from client components. The constants here are pure data and
// can be used freely from both sides.

export type ActorType = 'user' | 'system' | 'webhook' | 'cron' | 'public_token';

export type ActivityStatus = 'success' | 'failed' | 'skipped' | 'warning' | 'disabled';

export type ActivityModule =
  | 'orders'
  | 'customers'
  | 'deliveries'
  | 'inventory'
  | 'products'
  | 'finance'
  | 'reports'
  | 'settings'
  | 'auth'
  | 'integrations'
  | 'assistant';

export const STATUS_LABEL_HE: Record<ActivityStatus, string> = {
  success:  'הצליח',
  failed:   'נכשל',
  skipped:  'דולג',
  warning:  'אזהרה',
  disabled: 'כבוי',
};

export const ACTOR_LABEL_HE: Record<ActorType, string> = {
  user:         'משתמש',
  system:       'המערכת',
  webhook:      'אינטגרציה',
  cron:         'פעולה מתוזמנת',
  public_token: 'קישור ציבורי',
};

export const MODULE_LABEL_HE: Record<ActivityModule, string> = {
  orders:       'הזמנות',
  customers:    'לקוחות',
  deliveries:   'משלוחים',
  inventory:    'מלאי',
  products:     'מוצרים',
  finance:      'פיננסים',
  reports:      'דוחות',
  settings:     'הגדרות',
  auth:         'משתמשים והרשאות',
  integrations: 'אינטגרציות',
  assistant:    'עוזרת חכמה',
};
