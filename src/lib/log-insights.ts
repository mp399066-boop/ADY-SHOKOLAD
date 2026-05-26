// ============================================================================
// log-insights — Presentation/helper layer that turns one row of
// system_activity_logs into operator-friendly Hebrew explainers:
//   • what failed (titleHe)
//   • where it failed (failedAtHe)
//   • why it likely failed (likelyCauseHe)
//   • what to check next (nextCheckHe)
//   • a severity classification (critical / high / medium / low)
//   • a fingerprint for grouping repeated identical errors today
//
// This file deliberately does NOT touch how logs are written. It only reads
// the existing fields (module / action / status / service_key / error_message
// / metadata / entity_*) and converts them into UI copy.
//
// Safe to import from client components — no server-only imports.
// ============================================================================

import type { ActivityModule, ActivityStatus } from '@/lib/activity-log-labels';

// ── Public shape ────────────────────────────────────────────────────────────

export type InsightArea =
  | 'orders'
  | 'invoices'
  | 'emails'
  | 'woocommerce'
  | 'deliveries'
  | 'payments'
  | 'auth'
  | 'database'
  | 'system'
  | 'unknown';

export type InsightStatus = 'success' | 'warning' | 'failure' | 'info';

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface RelatedEntity {
  label: string;
  value: string;
}

export interface LogInsight {
  area:           InsightArea;
  status:         InsightStatus;
  titleHe:        string;
  failedAtHe:     string | null;
  likelyCauseHe:  string | null;
  nextCheckHe:    string | null;
  severity:       InsightSeverity;
  relatedEntities: RelatedEntity[];
  // Stable key used to group repeated identical errors today.
  fingerprint:    string;
}

export const AREA_LABEL_HE: Record<InsightArea, string> = {
  orders:      'הזמנות',
  invoices:    'חשבוניות',
  emails:      'מיילים',
  woocommerce: 'WooCommerce',
  deliveries:  'משלוחים',
  payments:    'תשלומים',
  auth:        'הרשאות / משתמשים',
  database:    'מסד נתונים',
  system:      'מערכת',
  unknown:     'לא מסווג',
};

export const SEVERITY_LABEL_HE: Record<InsightSeverity, string> = {
  critical: 'קריטי',
  high:     'גבוה',
  medium:   'בינוני',
  low:      'נמוך',
};

// ── Input row shape (subset of system_activity_logs columns) ────────────────

export interface LogRowLike {
  id?:             string;
  created_at?:     string;
  module?:         string | null;
  action?:         string | null;
  status?:         string | null;
  service_key?:    string | null;
  title?:          string | null;
  description?:    string | null;
  entity_type?:    string | null;
  entity_id?:      string | null;
  entity_label?:   string | null;
  error_message?:  string | null;
  metadata?:       Record<string, unknown> | null;
  actor_email?:    string | null;
  actor_name?:     string | null;
}

// ── Main classifier ─────────────────────────────────────────────────────────

export function classifyLog(row: LogRowLike): LogInsight {
  const status = normaliseStatus(row.status);
  const area   = deriveArea(row);

  const failedAtHe    = status === 'success' ? null : deriveFailedAt(area, row);
  const likelyCauseHe = status === 'success' ? null : deriveLikelyCause(row, area);
  const nextCheckHe   = status === 'success' ? null : deriveNextCheck(area, row, likelyCauseHe);
  const severity      = deriveSeverity(area, status, row);
  const titleHe       = deriveTitle(area, status, row);

  return {
    area,
    status,
    titleHe,
    failedAtHe,
    likelyCauseHe,
    nextCheckHe,
    severity,
    relatedEntities: deriveRelatedEntities(row),
    fingerprint:     deriveFingerprint(area, row),
  };
}

// ── Status normaliser ───────────────────────────────────────────────────────

function normaliseStatus(s: string | null | undefined): InsightStatus {
  switch (s) {
    case 'success':                       return 'success';
    case 'failed':                        return 'failure';
    case 'warning':                       return 'warning';
    case 'skipped':
    case 'disabled':                      return 'info';
    default:                              return 'info';
  }
}

// ── Area classification ─────────────────────────────────────────────────────

function deriveArea(row: LogRowLike): InsightArea {
  const action = (row.action || '').toLowerCase();
  const svc    = (row.service_key || '').toLowerCase();
  const mod    = (row.module || '').toLowerCase() as ActivityModule;

  // Service-key based — strongest signal.
  if (svc === 'morning_documents'       || /financial_document|invoice/.test(action)) return 'invoices';
  if (svc === 'customer_order_emails'   || svc === 'admin_alerts'
      || /email|alert/.test(action))                                                   return 'emails';
  if (svc === 'woocommerce_orders'      || /woocommerce|wc_/.test(action))             return 'woocommerce';
  if (svc === 'delivery_notifications'  || /delivery|courier/.test(action))            return 'deliveries';
  if (svc === 'payplus_payments'        || /payment_link|payment_status/.test(action)
      || /paid|payment/.test(action))                                                  return 'payments';
  if (svc === 'inventory_deduction'     || /inventory/.test(action))                   return 'orders';
  if (svc === 'daily_orders_report'     || /report/.test(action))                      return 'system';

  // Module-based — weaker but covers everything else.
  if (mod === 'orders')                                                                return 'orders';
  if (mod === 'finance')                                                                return 'invoices';
  if (mod === 'deliveries')                                                              return 'deliveries';
  if (mod === 'auth')                                                                    return 'auth';
  if (mod === 'integrations')                                                            return 'emails';
  if (mod === 'settings' || mod === 'reports' || mod === 'assistant')                    return 'system';
  if (mod === 'customers' || mod === 'inventory' || mod === 'products')                 return 'database';

  return 'unknown';
}

// ── "Where it fell" — human-readable failure location ───────────────────────

function deriveFailedAt(area: InsightArea, row: LogRowLike): string {
  const action = (row.action || '').toLowerCase();
  const svc    = (row.service_key || '').toLowerCase();

  if (svc === 'morning_documents'       || /financial_document/.test(action)) return 'Morning API (יצירת מסמך)';
  if (svc === 'customer_order_emails'   || /customer_order_email|order_summary_email/.test(action)) return 'SendGrid — מייל ללקוח';
  if (svc === 'admin_alerts'            || /admin.*alert/.test(action))       return 'SendGrid — התראה פנימית';
  if (svc === 'woocommerce_orders'      || /woocommerce|wc_|crm_order_paid_via_woocommerce/.test(action)) return 'WooCommerce webhook';
  if (svc === 'delivery_notifications'  || /courier|delivery/.test(action))   return 'שליחת קישור לשליח';
  if (svc === 'payplus_payments'        || /payment_link/.test(action))       return 'PayPlus — יצירת קישור תשלום';
  if (svc === 'inventory_deduction'     || /inventory/.test(action))          return 'הורדת מלאי';
  if (svc === 'daily_orders_report'     || /daily_report/.test(action))       return 'דוח יומי אוטומטי';

  switch (area) {
    case 'orders':     return 'יצירת/עדכון הזמנה';
    case 'invoices':   return 'הפקת מסמך פיננסי';
    case 'emails':     return 'שליחת מייל';
    case 'woocommerce':return 'WooCommerce webhook';
    case 'deliveries': return 'משלוחים';
    case 'payments':   return 'תשלומים';
    case 'auth':       return 'הרשאה / משתמש';
    case 'database':   return 'מסד נתונים';
    case 'system':     return 'תהליך מערכת';
    default:           return 'מיקום לא ידוע';
  }
}

// ── "Likely cause" — derived from error_message + context ───────────────────

function deriveLikelyCause(row: LogRowLike, area: InsightArea): string {
  const err = (row.error_message || row.description || '').toLowerCase();

  if (!err) return 'שגיאה לא מתועדת — יש לפתוח את הפרטים הטכניים.';

  // Network / connectivity
  if (/timeout|timed ?out|etimedout|econnreset|econnrefused|network|fetch failed/.test(err))
    return 'בעיית תקשורת זמנית מול שירות חיצוני.';

  // Auth / permissions
  if (/unauthor|forbidden|401|403|invalid.*key|invalid.*token|signature|webhook secret|api key/.test(err))
    return 'הרשאה או מפתח API לא תקינים.';

  // Validation / missing fields
  if (/required|missing|null|undefined|cannot read|not a function|empty/.test(err))
    return 'חסר שדה חובה או שדה ריק שצריך להיות מלא.';

  // Math / amount mismatch
  if (/total|amount|vat|מע"מ|mismatch|tax|לא תואם/.test(err))
    return 'סכום או חישוב לא תואם בין השדות.';

  // Duplicate / already exists
  if (/duplicate|already exists|unique|conflict/.test(err))
    return 'כפילות — הרשומה כבר קיימת.';

  // Not found
  if (/not found|404|does not exist|no rows/.test(err))
    return 'לקוח / הזמנה / רשומה לא נמצאו.';

  // External service explicit error
  if (/morning|payplus|sendgrid|woocommerce|wp|api/.test(err))
    return 'שירות חיצוני החזיר שגיאה.';

  // Database / supabase
  if (/supabase|postgres|sql|relation|column|row level security|rls/.test(err))
    return 'בעיה בכתיבה / קריאה מול מסד הנתונים.';

  // Area-specific fallbacks
  if (area === 'emails')      return 'שליחת המייל נכשלה — שירות מיילים החזיר שגיאה.';
  if (area === 'invoices')    return 'הפקת המסמך נכשלה — Morning החזיר שגיאה.';
  if (area === 'deliveries')  return 'שליחת ההודעה לשליח לא הצליחה.';
  if (area === 'woocommerce') return 'קליטת ההזמנה מ-WooCommerce נכשלה.';
  if (area === 'payments')    return 'יצירת/עדכון התשלום נכשלה.';

  return 'שגיאת קוד לא מסווגת.';
}

// ── "What to check next" — practical, short ─────────────────────────────────

function deriveNextCheck(area: InsightArea, row: LogRowLike, cause: string | null): string {
  const err = (row.error_message || '').toLowerCase();
  const c   = (cause || '').toLowerCase();

  // Cause-driven hints first — these are area-agnostic but very actionable.
  if (/הרשאה|מפתח api/.test(c))
    return 'בדקי שמפתחות ה-API / webhook secret מוגדרים נכון ב-Vercel ושטרם פגו.';
  if (/תקשורת/.test(c))
    return 'נסי שוב בעוד דקה. אם חוזר — בדקי את סטטוס השירות החיצוני.';
  if (/כפילות/.test(c))
    return 'בדקי אם ההזמנה / החשבונית כבר קיימות במערכת לפני יצירה נוספת.';
  if (/לא נמצאו/.test(c))
    return 'בדקי שמספר ההזמנה / הלקוח קיים במערכת ולא נמחק.';
  if (/חסר שדה/.test(c))
    return 'בדקי את הפרטים הטכניים — חסר שדה חובה ברשומה.';

  switch (area) {
    case 'invoices':
      if (/total|amount|vat|מע"מ/.test(err))
        return 'בדקי את סה"כ ההזמנה והמע"מ. בדקי גם את Edge Function logs של create-morning-invoice.';
      return 'בדקי את Edge Function logs של create-morning-invoice ב-Supabase.';

    case 'emails':
      if (/email|address|recipient/.test(err))
        return 'בדקי שללקוח יש כתובת מייל תקינה בכרטיס הלקוח.';
      return 'בדקי את הגדרות SendGrid ושכתובת המייל של היעד תקינה.';

    case 'woocommerce':
      return 'בדקי שה-webhook secret מוגדר ב-Vercel ושההזמנה לא נקלטה כבר (כפילות).';

    case 'deliveries':
      return 'בדקי שלשליח יש מייל / טלפון תקינים, ושההזמנה לא בוטלה.';

    case 'payments':
      return 'בדקי שקישור PayPlus נוצר תקין, ושסכום ההזמנה תואם את הסכום שנשלח.';

    case 'orders':
      return 'בדקי את שדות החובה של ההזמנה — לקוח, פריטים, סכום, סטטוס.';

    case 'auth':
      return 'בדקי שלמשתמש יש את ההרשאות הנדרשות בטבלת users.';

    case 'database':
      return 'בדקי את מבנה הטבלה / שדות החובה ב-Supabase.';

    case 'system':
      return 'בדקי את לוגי ה-Vercel function הרלוונטית.';

    default:
      return 'פתחי את הפרטים הטכניים והעבירי את ההודעה למפתח.';
  }
}

// ── Severity ────────────────────────────────────────────────────────────────

function deriveSeverity(area: InsightArea, status: InsightStatus, row: LogRowLike): InsightSeverity {
  if (status === 'success') return 'low';
  if (status === 'info')    return 'low';

  if (status === 'failure') {
    // Critical: anything that blocks money, customer-facing email, or order intake.
    if (area === 'invoices')    return 'critical';
    if (area === 'woocommerce') return 'critical';
    if (area === 'payments')    return 'critical';
    if (area === 'emails') {
      // Customer-facing email > admin alert for severity.
      if ((row.service_key || '') === 'customer_order_emails') return 'critical';
      return 'high';
    }
    if (area === 'deliveries')  return 'high';
    if (area === 'orders')      return 'high';
    if (area === 'auth')        return 'high';
    if (area === 'database')    return 'high';
    return 'medium';
  }

  // warnings
  return 'medium';
}

// ── Title (plain Hebrew, no developer language) ─────────────────────────────

function deriveTitle(area: InsightArea, status: InsightStatus, row: LogRowLike): string {
  // Trust caller-provided titles when they read clean. Otherwise build one.
  const raw = (row.title || '').trim();
  if (raw && !/^[a-z_]+$/.test(raw)) return raw;

  const verb = status === 'failure' ? 'נכשלה' : status === 'warning' ? 'אזהרה' : 'בוצעה';
  switch (area) {
    case 'orders':      return `הזמנה — פעולה ${verb}`;
    case 'invoices':    return `הפקת חשבונית ${verb}`;
    case 'emails':      return `שליחת מייל ${verb}`;
    case 'woocommerce': return `קליטת הזמנה מ-WooCommerce ${verb}`;
    case 'deliveries':  return `הודעת שליח ${verb}`;
    case 'payments':    return `פעולת תשלום ${verb}`;
    case 'auth':        return `פעולת הרשאה ${verb}`;
    case 'database':    return `פעולת מסד נתונים ${verb}`;
    case 'system':      return `פעולת מערכת ${verb}`;
    default:            return `פעולה ${verb}`;
  }
}

// ── Related entities — surface the IDs the operator cares about ─────────────

function deriveRelatedEntities(row: LogRowLike): RelatedEntity[] {
  const out: RelatedEntity[] = [];

  // entity_label is the operator-readable label (customer name, order number, …)
  if (row.entity_label) {
    const labelKey =
      row.entity_type === 'order'    ? 'הזמנה' :
      row.entity_type === 'customer' ? 'לקוח' :
      row.entity_type === 'delivery' ? 'משלוח' :
      row.entity_type === 'invoice'  ? 'חשבונית' :
      row.entity_type === 'product'  ? 'מוצר' :
      'פריט';
    out.push({ label: labelKey, value: row.entity_label });
  }

  // Pull common fields out of metadata if present — but never expose secrets.
  const md = row.metadata || {};
  const pickStr = (k: string): string | null => {
    const v = (md as Record<string, unknown>)[k];
    if (typeof v === 'string' && v && !/key|secret|token|password/i.test(k)) return v;
    if (typeof v === 'number') return String(v);
    return null;
  };

  const email = pickStr('email') || pickStr('to') || pickStr('recipient') || row.actor_email;
  if (email && !out.some(e => e.value === email)) out.push({ label: 'מייל', value: email });

  const orderNumber = pickStr('order_number') || pickStr('orderNumber');
  if (orderNumber && !out.some(e => e.value === orderNumber)) out.push({ label: 'מספר הזמנה', value: orderNumber });

  const courier = pickStr('courier') || pickStr('courier_name');
  if (courier) out.push({ label: 'שליח', value: courier });

  const docId = pickStr('document_id') || pickStr('doc_id');
  if (docId) out.push({ label: 'מסמך', value: docId });

  return out.slice(0, 4);
}

// ── Fingerprint — used to group repeated identical failures today ───────────

function deriveFingerprint(area: InsightArea, row: LogRowLike): string {
  const err = (row.error_message || '')
    .toLowerCase()
    // Strip ids / numbers / uuids / timestamps so similar errors collapse.
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/g, '<uuid>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${area}|${row.action || ''}|${err}`;
}

// ── Group repeated insights and return them with counts (newest first) ──────

export interface InsightWithCount<T> {
  row:     T;
  insight: LogInsight;
  count:   number;
}

export function groupRepeatedToday<T extends LogRowLike>(rows: T[]): InsightWithCount<T>[] {
  const today = startOfTodayISO();
  const map   = new Map<string, InsightWithCount<T>>();

  for (const r of rows) {
    const ins = classifyLog(r);
    const isToday = (r.created_at || '') >= today;
    if (!isToday || ins.status === 'success') {
      // Don't dedupe successes and non-today rows — return as-is.
      const key = `${r.id || Math.random()}`;
      map.set(key, { row: r, insight: ins, count: 1 });
      continue;
    }
    const existing = map.get(ins.fingerprint);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(ins.fingerprint, { row: r, insight: ins, count: 1 });
    }
  }
  return Array.from(map.values());
}

export function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Build a tiny 3-step timeline from one row ───────────────────────────────

export interface TimelineStep {
  ok:    boolean;
  text:  string;
}

export function deriveTimeline(row: LogRowLike, insight: LogInsight): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const failed  = insight.status === 'failure';
  const warning = insight.status === 'warning';

  // Step 1 — always: process started
  steps.push({ ok: true, text: 'התחיל' });

  // Step 2 — mid-process; success implied unless failure happened first
  const midText = midStepText(insight.area);
  if (failed) {
    steps.push({ ok: false, text: `נפל ב-${insight.failedAtHe || midText}` });
  } else if (warning) {
    steps.push({ ok: true, text: midText });
    steps.push({ ok: false, text: 'הסתיים עם אזהרה' });
  } else {
    steps.push({ ok: true, text: midText });
    steps.push({ ok: true, text: 'הסתיים בהצלחה' });
  }

  return steps;
}

function midStepText(area: InsightArea): string {
  switch (area) {
    case 'orders':      return 'בניית ההזמנה';
    case 'invoices':    return 'שליחה ל-Morning';
    case 'emails':      return 'שליחה ל-SendGrid';
    case 'woocommerce': return 'קריאת ה-webhook';
    case 'deliveries':  return 'שליחת קישור לשליח';
    case 'payments':    return 'יצירת קישור תשלום';
    case 'auth':        return 'בדיקת הרשאה';
    case 'database':    return 'כתיבה ל-DB';
    case 'system':      return 'הפעלת התהליך';
    default:            return 'ביצוע הפעולה';
  }
}
