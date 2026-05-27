export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// GET /api/assistant/snapshot
//
// Live "what's on my plate right now" snapshot the assistant drawer renders
// the moment it opens — replaces the noisy 11-example empty state with real
// numbers from the operator's own data:
//
//   - open_orders     active orders (not cancelled, not draft, not completed)
//   - unpaid_orders   orders with סטטוס_תשלום != 'שולם' (and not cancelled)
//   - deliveries_today deliveries scheduled for today that aren't delivered yet
//   - low_stock_count raw materials currently flagged below threshold
//   - errors_7d       system_activity_logs.failed in the last 7 days
//
// Pure read. No mutations. Management-gated like the rest of the assistant API.

type Snapshot = {
  open_orders:       number;
  unpaid_orders:     number;
  deliveries_today:  number;
  low_stock_count:   number;
  errors_7d:         number;
  generated_at:      string;
};

function todayIsoDate(): string {
  // Asia/Jerusalem "today" — same timezone used elsewhere in the CRM. We
  // build the YYYY-MM-DD by hand so it doesn't drift on UTC-midnight days.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now); // "YYYY-MM-DD"
}

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const today = todayIsoDate();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Each tile uses head:true + count:'exact' so we never pay for the rows —
  // just the counts. Failures are swallowed per-tile so a single broken query
  // doesn't collapse the whole snapshot; the affected tile just shows 0.

  const [open, unpaid, deliveriesToday, lowStock, errors] = await Promise.all([
    // Open orders: not cancelled, not draft, not completed.
    supabase
      .from('הזמנות')
      .select('id', { count: 'exact', head: true })
      .not('סטטוס_הזמנה', 'in', '("בוטלה","טיוטה","הושלמה בהצלחה")')
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // Unpaid orders: payment status not "שולם" AND order not cancelled/draft.
    supabase
      .from('הזמנות')
      .select('id', { count: 'exact', head: true })
      .neq('סטטוס_תשלום', 'שולם')
      .not('סטטוס_הזמנה', 'in', '("בוטלה","טיוטה")')
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // Deliveries scheduled for today that aren't already delivered.
    supabase
      .from('משלוחים')
      .select('id', { count: 'exact', head: true })
      .eq('תאריך_משלוח', today)
      .neq('סטטוס_משלוח', 'נמסר')
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // Raw materials flagged as low (best-effort — schema differs across
    // deployments; if the boolean column doesn't exist we just return 0).
    supabase
      .from('מלאי_חומרי_גלם')
      .select('id', { count: 'exact', head: true })
      .eq('סטטוס_מלאי', 'מלאי נמוך')
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),

    // System failures in the last 7 days — taps the same table the new
    // לוגים page reads, so the assistant surfaces the same "you have errors"
    // signal we just shipped.
    supabase
      .from('system_activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', sevenDaysAgo)
      .then((r: { count: number | null }) => r.count ?? 0)
      .catch(() => 0),
  ]);

  const snapshot: Snapshot = {
    open_orders:      open,
    unpaid_orders:    unpaid,
    deliveries_today: deliveriesToday,
    low_stock_count:  lowStock,
    errors_7d:        errors,
    generated_at:     new Date().toISOString(),
  };

  return NextResponse.json(snapshot);
}
