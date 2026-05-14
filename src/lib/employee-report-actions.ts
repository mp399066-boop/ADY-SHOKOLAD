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
  | { status: 'success'; action: EmployeeReportAction };

const READY_FOR_DELIVERY_STATUS = 'מוכנה למשלוח';
const EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ACTIONS = new Set<EmployeeReportAction>(['acknowledged', 'ready_for_delivery']);

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
    const acknowledgedSig = sign(orderId, 'acknowledged', expires);
    const readySig = sign(orderId, 'ready_for_delivery', expires);
    links[orderId] = {
      acknowledgedUrl: `${base}/order-action?orderId=${encodeURIComponent(orderId)}&action=acknowledged&exp=${expires}&sig=${acknowledgedSig}`,
      readyUrl: `${base}/order-action?orderId=${encodeURIComponent(orderId)}&action=ready_for_delivery&exp=${expires}&sig=${readySig}`,
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
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return { status: 'expired' };
  if (!isValidSignature(orderId, normalizedAction, expires, sig)) return { status: 'invalid' };

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, סטטוס_הזמנה')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { status: 'invalid' };

  const orderNumber = String(order['מספר_הזמנה'] || '');
  const activityAction = normalizedAction === 'acknowledged'
      ? 'employee_order_acknowledged'
      : 'employee_marked_order_ready_for_delivery';

  const { data: existingLog } = await supabase
    .from('system_activity_logs')
    .select('id')
    .eq('entity_type', 'order')
    .eq('entity_id', orderId)
    .eq('action', activityAction)
    .eq('status', 'success')
    .limit(1)
    .maybeSingle();

  if (existingLog && normalizedAction === 'acknowledged') {
    return { status: 'already_done', action: normalizedAction };
  }

  if (
    existingLog
    && normalizedAction === 'ready_for_delivery'
    && order['סטטוס_הזמנה'] === READY_FOR_DELIVERY_STATUS
  ) {
    return { status: 'already_done', action: normalizedAction };
  }

  if (normalizedAction === 'ready_for_delivery' && order['סטטוס_הזמנה'] !== READY_FOR_DELIVERY_STATUS) {
    const { error: updateError } = await supabase
      .from('הזמנות')
      .update({ סטטוס_הזמנה: READY_FOR_DELIVERY_STATUS, תאריך_עדכון: new Date().toISOString() })
      .eq('id', orderId);
    if (updateError) {
      throw new Error(`עדכון סטטוס ההזמנה נכשל: ${updateError.message}`);
    }
  }

  if (!existingLog) {
    void logActivity({
      actor: { ...PUBLIC_TOKEN_ACTOR, name: 'Employee report link' },
      module: 'orders',
      action: activityAction,
      status: 'success',
      entityType: 'order',
      entityId: orderId,
      entityLabel: orderNumber || null,
      title: normalizedAction === 'acknowledged'
        ? 'העובדת אישרה שקיבלה את ההזמנה'
        : 'העובדת סימנה הזמנה כמוכנה למשלוח',
      metadata: { source: 'employee_report_email', expires },
      request,
    });
  }

  return { status: 'success', action: normalizedAction };
}
