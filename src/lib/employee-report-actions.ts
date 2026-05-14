import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { logActivity, PUBLIC_TOKEN_ACTOR } from '@/lib/activity-log';

export type EmployeeReportAction = 'acknowledged' | 'ready_for_delivery';

export type EmployeeReportActionLinks = {
  acknowledgedUrl: string;
  readyUrl: string;
};

export type EmployeeReportActionResult =
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'already_done'; action: EmployeeReportAction }
  | { status: 'success';      action: EmployeeReportAction };

// Target סטטוס_הזמנה values for each button. These are the exact strings
// the rest of the CRM uses (PATCH /api/orders/[id], the order detail
// pills, the deliveries filter) — do not introduce new spellings here.
const IN_PREPARATION_STATUS    = 'בהכנה';
const READY_FOR_DELIVERY_STATUS = 'מוכנה למשלוח';
const EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ACTIONS = new Set<EmployeeReportAction>(['acknowledged', 'ready_for_delivery']);

// Forward-only progression. If the order is already at-or-past the
// requested status (e.g. operator already moved it to "מוכנה למשלוח"
// manually, then employee clicks "ההזמנה התקבלה" later) we return
// already_done rather than rolling the status backwards.
const STATUS_RANK: Record<string, number> = {
  'טיוטה':         0,
  'חדשה':          1,
  'בהכנה':         2,
  'מוכנה למשלוח': 3,
  'נשלחה':         4,
  'הושלמה בהצלחה': 5,
};
function statusRank(s: string | null | undefined): number {
  if (!s) return 0;
  const r = STATUS_RANK[s];
  return typeof r === 'number' ? r : 0;
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, '');
  return '';
}

function reportActionSecret(): string {
  const secret = process.env.REPORT_ACTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('REPORT_ACTION_SECRET חסר או קצר מדי');
  }
  return secret;
}

function payload(orderId: string, action: EmployeeReportAction, expires: string): string {
  return `${orderId}.${action}.${expires}`;
}

function sign(orderId: string, action: EmployeeReportAction, expires: string): string {
  return createHmac('sha256', reportActionSecret())
    .update(payload(orderId, action, expires))
    .digest('hex');
}

function isValidSignature(orderId: string, action: EmployeeReportAction, expires: string, sig: string): boolean {
  const expected = sign(orderId, action, expires);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sig, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function createEmployeeReportActionLinks({
  orderIds,
}: {
  orderIds: string[];
  recipientEmail: string;
}): Promise<Record<string, EmployeeReportActionLinks>> {
  const base = appBaseUrl();
  if (orderIds.length === 0) return {};
  if (!base) {
    throw new Error('APP_URL או NEXT_PUBLIC_APP_URL חסר - לא ניתן ליצור קישורי פעולה חתומים');
  }

  const expires = String(Date.now() + EXPIRES_IN_MS);
  const links: Record<string, EmployeeReportActionLinks> = {};

  for (const orderId of orderIds) {
    const acknowledgedSig = sign(orderId, 'acknowledged',       expires);
    const readySig        = sign(orderId, 'ready_for_delivery', expires);
    links[orderId] = {
      acknowledgedUrl: `${base}/order-action?orderId=${encodeURIComponent(orderId)}&action=acknowledged&exp=${expires}&sig=${acknowledgedSig}`,
      readyUrl:        `${base}/order-action?orderId=${encodeURIComponent(orderId)}&action=ready_for_delivery&exp=${expires}&sig=${readySig}`,
    };
  }

  return links;
}

export async function performEmployeeReportAction({
  orderId,
  action,
  expires,
  sig,
  request,
}: {
  orderId: string;
  action: string;
  expires: string;
  sig: string;
  request?: Request;
}): Promise<EmployeeReportActionResult> {
  const normalizedAction = action as EmployeeReportAction;
  if (!orderId || !expires || !sig || !ALLOWED_ACTIONS.has(normalizedAction)) return { status: 'invalid' };
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now())                 return { status: 'expired' };
  if (!isValidSignature(orderId, normalizedAction, expires, sig))            return { status: 'invalid' };

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, סטטוס_הזמנה')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { status: 'invalid' };

  const orderNumber  = String(order['מספר_הזמנה'] || '');
  const currentStat  = (order['סטטוס_הזמנה'] as string | null) || null;
  const targetStatus = normalizedAction === 'acknowledged'
    ? IN_PREPARATION_STATUS
    : READY_FOR_DELIVERY_STATUS;

  // Forward-only: if the order is already at-or-past the requested status
  // we report already_done instead of rolling the status backwards. This
  // also covers the "click twice" idempotency case for free.
  if (statusRank(currentStat) >= statusRank(targetStatus)) {
    return { status: 'already_done', action: normalizedAction };
  }

  // Update the status. We mirror the PATCH /api/orders/[id] write shape
  // (תאריך_עדכון, no other fields touched) so the order looks identical
  // whether the operator clicked the pill or the employee clicked the
  // email button.
  const { error: updateError } = await supabase
    .from('הזמנות')
    .update({
      סטטוס_הזמנה:  targetStatus,
      תאריך_עדכון:  new Date().toISOString(),
    })
    .eq('id', orderId);
  if (updateError) {
    throw new Error(`עדכון סטטוס ההזמנה נכשל: ${updateError.message}`);
  }

  // Mirror the activity log row that PATCH /api/orders/[id] writes for a
  // status transition — so the system-control activity feed shows the
  // same kind of row whether the change came from the operator or from
  // an email-button click. Actor distinguishes the two sources.
  const employeeActor = { ...PUBLIC_TOKEN_ACTOR, name: 'Employee report link' };

  void logActivity({
    actor:        employeeActor,
    module:       'orders',
    action:       'order_status_changed',
    status:       'success',
    entityType:   'order',
    entityId:     orderId,
    entityLabel:  orderNumber || null,
    title:        `שינוי סטטוס הזמנה: ${currentStat ?? '—'} → ${targetStatus}`,
    oldValue:     { סטטוס_הזמנה: currentStat },
    newValue:     { סטטוס_הזמנה: targetStatus },
    metadata:     { source: 'employee_report_email', triggered_by: normalizedAction, expires },
    request,
  });

  // Also log a button-specific row so an audit by "which button did the
  // employee click" remains possible — useful for funnel analysis.
  void logActivity({
    actor:       employeeActor,
    module:      'orders',
    action:      normalizedAction === 'acknowledged'
                  ? 'employee_order_acknowledged'
                  : 'employee_marked_order_ready_for_delivery',
    status:      'success',
    entityType:  'order',
    entityId:    orderId,
    entityLabel: orderNumber || null,
    title:       normalizedAction === 'acknowledged'
                  ? 'העובדת אישרה שקיבלה את ההזמנה'
                  : 'העובדת סימנה הזמנה כמוכנה למשלוח',
    metadata:    { source: 'employee_report_email', expires },
    request,
  });

  return { status: 'success', action: normalizedAction };
}
