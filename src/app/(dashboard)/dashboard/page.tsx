'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/utils';
import type { DashboardStats, Order } from '@/types/database';

// ─── Tiny inline icon set ──────────────────────────────────────────────────
function Icon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const props = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'truck':    return <svg {...props}><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
    case 'bag':      return <svg {...props}><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>;
    case 'clock':    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'wallet':   return <svg {...props}><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1 0-4h13"/><circle cx="17" cy="13" r="1"/></svg>;
    case 'check':    return <svg {...props}><path d="m5 13 4 4 10-10"/></svg>;
    case 'box':      return <svg {...props}><path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>;
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'user':     return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case 'list':     return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>;
    case 'arrow':    return <svg {...props}><path d="m15 6-6 6 6 6"/></svg>;
    case 'alert':    return <svg {...props}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'chevron':  return <svg {...props}><path d="m9 6 6 6-6 6"/></svg>;
    case 'dot':      return <svg {...props}><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>;
    case 'flame':    return <svg {...props}><path d="M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3 2-4-1 3 1 4 2 4 0-3-1-6 1-10z"/></svg>;
    default:         return null;
  }
}

// ─── Helpers (UI/derive only — no business logic, no DB writes) ────────────

function nowMinutesIsrael(): number {
  const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' });
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function timeKey(t?: string | null): number {
  if (!t) return 24 * 60 + 1;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function relativeTimeHe(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return 'כרגע';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} שע׳`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

type TodayOrder = Order & {
  לקוחות?: { שם_פרטי: string; שם_משפחה: string };
  סוג_אספקה?: string;
  שעת_אספקה?: string | null;
  תאריך_יצירה?: string;
};

// Build a small "recent activity" feed from the most recent orders.
// No new endpoint — derived from /api/orders?limit=8 (already public).
type ActivityItem = {
  id: string;
  kind: 'paid' | 'completed' | 'shipped' | 'urgent' | 'new';
  text: string;
  amount?: number;
  href: string;
  at: string;
};

function deriveActivity(recent: TodayOrder[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const o of recent) {
    const c = (o as TodayOrder).לקוחות;
    const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : 'לקוח';
    const at = (o as { תאריך_עדכון?: string; תאריך_יצירה?: string }).תאריך_עדכון
            ?? (o as { תאריך_יצירה?: string }).תאריך_יצירה
            ?? '';
    const href = `/orders/${o.id}`;
    if (o.סטטוס_תשלום === 'שולם') {
      out.push({ id: `${o.id}-paid`, kind: 'paid', text: `תשלום התקבל מ-${name}`, amount: o.סך_הכל_לתשלום ?? undefined, href, at });
    } else if (o.סטטוס_הזמנה === 'הושלמה בהצלחה') {
      out.push({ id: `${o.id}-done`, kind: 'completed', text: `הזמנה הושלמה — ${name}`, amount: o.סך_הכל_לתשלום ?? undefined, href, at });
    } else if (o.סטטוס_הזמנה === 'נשלחה') {
      out.push({ id: `${o.id}-ship`, kind: 'shipped', text: `יצא משלוח ל-${name}`, href, at });
    } else if (o.הזמנה_דחופה) {
      out.push({ id: `${o.id}-urg`, kind: 'urgent', text: `הזמנה דחופה — ${name}`, amount: o.סך_הכל_לתשלום ?? undefined, href, at });
    } else {
      out.push({ id: `${o.id}-new`, kind: 'new', text: `הזמנה חדשה מ-${name}`, amount: o.סך_הכל_לתשלום ?? undefined, href, at });
    }
  }
  return out
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [recentOrders, setRecentOrders] = useState<TodayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateStr = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/orders?filter=today&limit=100').then(r => r.json()),
      fetch('/api/orders?limit=8').then(r => r.json()),
    ]).then(([dashData, todayData, recentData]) => {
      if (dashData.error) throw new Error(dashData.error);
      if (todayData.error) throw new Error(todayData.error);
      setStats(dashData.data);
      setTodayOrders((todayData.data || []) as TodayOrder[]);
      setRecentOrders((recentData?.data || []) as TodayOrder[]);
    }).catch(() => {
      setError('שגיאה בטעינת נתוני הדשבורד');
    }).finally(() => setLoading(false));
  }, []);

  const sortedToday = useMemo(
    () => [...todayOrders]
      .filter(o => o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה')
      .sort((a, b) => timeKey(a.שעת_אספקה) - timeKey(b.שעת_אספקה)),
    [todayOrders],
  );
  const expectedRevenue = useMemo(
    () => sortedToday.reduce((sum, o) => sum + (o.סך_הכל_לתשלום || 0), 0),
    [sortedToday],
  );
  const avgOrder = sortedToday.length > 0 ? expectedRevenue / sortedToday.length : 0;
  const activity = useMemo(() => deriveActivity(recentOrders), [recentOrders]);

  // Highlight the next order in the timeline (UI only — no business effect).
  const nextOrderIdx = useMemo(() => {
    if (sortedToday.length === 0) return -1;
    const nowKey = nowMinutesIsrael();
    const idx = sortedToday.findIndex(o => timeKey(o.שעת_אספקה) >= nowKey);
    return idx === -1 ? 0 : idx;
  }, [sortedToday]);

  if (loading) return <PageLoading />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3" dir="rtl">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
          <Icon name="alert" className="w-7 h-7 text-red-500" />
        </div>
        <p className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
          className="text-xs px-4 py-2 rounded-lg"
          style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}
        >
          נסה שוב
        </button>
      </div>
    );
  }

  const s: DashboardStats = stats || {
    ordersToday: 0, ordersTomorrow: 0, urgentOrders: 0, unpaidOrders: 0,
    inPreparation: 0, readyForDelivery: 0, shipped: 0, lowInventory: 0,
    deliveriesToday: 0, unpaidAmount: 0,
    deliveriesCollected: 0, deliveriesDelivered: 0, revenueToday: 0,
  };

  // Itemized attention list — only items with value > 0 land here.
  type AttItem = { key: string; icon: string; text: string; href: string; tone: 'red' | 'amber' | 'plum' | 'sky' };
  const attention: AttItem[] = [];
  if (s.urgentOrders > 0) attention.push({ key: 'urgent',  icon: 'flame',    text: `${s.urgentOrders} הזמנות דחופות`,           href: '/orders?filter=urgent',      tone: 'red'   });
  if (s.unpaidOrders > 0) attention.push({ key: 'unpaid',  icon: 'wallet',   text: `${s.unpaidOrders} הזמנות לא שולמו`,         href: '/orders?filter=unpaid',      tone: 'amber' });
  if (s.lowInventory > 0) attention.push({ key: 'lowInv',  icon: 'box',      text: `${s.lowInventory} פריטי מלאי נמוכים`,       href: '/inventory',                 tone: 'red'   });
  if (s.inPreparation > 0) attention.push({ key: 'prep',   icon: 'clock',    text: `${s.inPreparation} הזמנות בהכנה`,            href: '/orders?filter=preparation', tone: 'plum'  });
  if (s.readyForDelivery > 0) attention.push({ key: 'rdy', icon: 'check',    text: `${s.readyForDelivery} מוכנות למשלוח`,        href: '/orders?filter=ready',       tone: 'amber' });
  if (s.ordersTomorrow > 0) attention.push({ key: 'tom',   icon: 'calendar', text: `${s.ordersTomorrow} הזמנות מחר`,             href: '/orders?filter=tomorrow',    tone: 'sky'   });

  const toneStyle: Record<AttItem['tone'], { bg: string; iconBg: string; iconCol: string; text: string }> = {
    red:   { bg: '#FEF2F2', iconBg: '#FECACA', iconCol: '#B91C1C', text: '#991B1B' },
    amber: { bg: '#FFFBEB', iconBg: '#FDE68A', iconCol: '#92400E', text: '#92400E' },
    plum:  { bg: '#F5F0FA', iconBg: '#DDD6FE', iconCol: '#6D28D9', text: '#5B21B6' },
    sky:   { bg: '#F0F9FF', iconBg: '#BAE6FD', iconCol: '#0369A1', text: '#075985' },
  };

  const activityKindStyle: Record<ActivityItem['kind'], { dot: string; bg: string }> = {
    paid:      { dot: '#059669', bg: '#ECFDF5' },
    completed: { dot: '#0891B2', bg: '#ECFEFF' },
    shipped:   { dot: '#0369A1', bg: '#EFF6FF' },
    urgent:    { dot: '#DC2626', bg: '#FEF2F2' },
    new:       { dot: '#8B5E34', bg: '#FBF5EA' },
  };

  return (
    <div dir="rtl" className="space-y-4 max-w-7xl pb-8">

      {/* ════════ GREETING ════════ */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: '#2B1A10' }}>שלום!</h1>
          <p className="text-xs mt-0.5" style={{ color: '#9B7A5A' }}>{dateStr}</p>
        </div>
        <Link href="/orders/new" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-full transition-colors" style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}>
          <Icon name="plus" className="w-3.5 h-3.5" /> הזמנה חדשה
        </Link>
      </header>

      {/* ════════ ROW 1 — 4 KPI cards ════════ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="bag"
          label="הזמנות היום"
          value={String(s.ordersToday)}
          accent="#8B5E34"
          href="/orders?filter=today"
          sub={s.ordersTomorrow > 0 ? `${s.ordersTomorrow} מחר` : 'אין הזמנות מחר'}
        />
        <KpiCard
          icon="wallet"
          label="הכנסה צפויה היום"
          value={formatCurrency(expectedRevenue)}
          accent="#0F766E"
          tint="#ECFDF5"
          sub={sortedToday.length > 0 ? `ממוצע ${formatCurrency(avgOrder)}` : 'אין הזמנות פעילות'}
        />
        <KpiCard
          icon="clock"
          label="ממתין לתשלום"
          value={formatCurrency(s.unpaidAmount)}
          accent={s.unpaidOrders > 0 ? '#B45309' : '#9B7A5A'}
          tint={s.unpaidOrders > 0 ? '#FFFBEB' : undefined}
          href="/orders?filter=unpaid"
          sub={s.unpaidOrders > 0 ? `${s.unpaidOrders} הזמנות פתוחות` : 'הכל סגור'}
        />
        <KpiCard
          icon="truck"
          label="משלוחים היום"
          value={String(s.deliveriesToday)}
          accent="#0369A1"
          tint="#F0F9FF"
          href="/deliveries"
          sub={`${s.deliveriesDelivered} נמסרו · ${s.deliveriesCollected} נאספו`}
        />
      </section>

      {/* ════════ ROW 2 — Timeline (2/3) + Attention (1/3) ════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>לוח זמנים — היום</h2>
            <Link href="/orders?filter=today" className="text-xs hover:underline flex items-center gap-1" style={{ color: '#8B5E34' }}>
              צפי הכל <Icon name="arrow" className="w-3 h-3 rtl-flip" />
            </Link>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #EAE0D4' }}>
            {sortedToday.length === 0 ? (
              <EmptyInline icon="clock" text="אין הזמנות להיום — יום שקט" />
            ) : (
              <ul>
                {sortedToday.map((order, idx) => {
                  const c = order.לקוחות;
                  const fullName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : '—';
                  const isDelivery = order.סוג_אספקה === 'משלוח';
                  const isLast = idx === sortedToday.length - 1;
                  const isNext = idx === nextOrderIdx;
                  return (
                    <li
                      key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-amber-50/60 group"
                      style={{
                        borderBottom: isLast ? 'none' : '1px solid #F5ECD8',
                        backgroundColor: isNext ? '#FBF5EA' : undefined,
                      }}
                    >
                      <div className="flex-shrink-0 text-center w-12">
                        <p className="text-sm font-bold tabular-nums" style={{ color: isNext ? '#8B5E34' : '#2B1A10' }}>
                          {order.שעת_אספקה || '—:—'}
                        </p>
                        {isNext && (
                          <p className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#8B5E34' }}>הבא</p>
                        )}
                      </div>
                      <span
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: isDelivery ? '#E0F2FE' : '#FEF3C7',
                          color: isDelivery ? '#0369A1' : '#92400E',
                        }}
                        title={isDelivery ? 'משלוח' : 'איסוף עצמי'}
                      >
                        <Icon name={isDelivery ? 'truck' : 'box'} className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate" style={{ color: '#2B1A10' }}>{fullName}</span>
                          {order.הזמנה_דחופה && <UrgentBadge />}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: '#9B7A5A' }}>
                          <span className="font-mono">{order.מספר_הזמנה}</span>
                          <span>·</span>
                          <span>{isDelivery ? 'משלוח' : 'איסוף'}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-3">
                        <StatusBadge status={order.סטטוס_הזמנה} type="order" />
                        <span className="text-sm font-semibold tabular-nums w-20 text-left" style={{ color: '#8B5E34' }}>
                          {formatCurrency(order.סך_הכל_לתשלום)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Attention */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>מה דורש טיפול</h2>
            {attention.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                {attention.length}
              </span>
            )}
          </div>
          <div className="bg-white rounded-2xl p-3 space-y-1.5" style={{ border: '1px solid #EAE0D4', minHeight: 200 }}>
            {attention.length === 0 ? (
              <EmptyInline icon="check" text="הכל תחת בקרה" />
            ) : (
              attention.map(a => {
                const t = toneStyle[a.tone];
                return (
                  <Link
                    key={a.key}
                    href={a.href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors hover:bg-stone-50/60 group"
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: t.iconBg, color: t.iconCol }}>
                      <Icon name={a.icon} className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 text-xs font-medium" style={{ color: t.text }}>{a.text}</span>
                    <Icon name="chevron" className="w-3 h-3 rtl-flip opacity-0 group-hover:opacity-60 transition-opacity" />
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* ════════ ROW 3 — Activity (2/3) + Sidebar KPIs + Quick (1/3) ════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Activity feed */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>פעילות אחרונה</h2>
            <Link href="/orders" className="text-xs hover:underline" style={{ color: '#8B5E34' }}>צפי הכל</Link>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #EAE0D4', minHeight: 200 }}>
            {activity.length === 0 ? (
              <EmptyInline icon="clock" text="אין פעילות לאחרונה" />
            ) : (
              <ul>
                {activity.map((a, idx) => {
                  const t = activityKindStyle[a.kind];
                  const isLast = idx === activity.length - 1;
                  return (
                    <li
                      key={a.id}
                      onClick={() => router.push(a.href)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-amber-50/60"
                      style={{ borderBottom: isLast ? 'none' : '1px solid #F5ECD8' }}
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: t.bg, color: t.dot }}>
                        <Icon name="dot" className="w-2 h-2" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" style={{ color: '#2B1A10' }}>{a.text}</p>
                        <p className="text-[11px]" style={{ color: '#9B7A5A' }}>{relativeTimeHe(a.at)}</p>
                      </div>
                      {typeof a.amount === 'number' && a.amount > 0 && (
                        <span className="text-xs font-semibold tabular-nums" style={{ color: '#8B5E34' }}>
                          {formatCurrency(a.amount)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          {/* Compact KPI block */}
          <div className="bg-white rounded-2xl p-3 space-y-2.5" style={{ border: '1px solid #EAE0D4' }}>
            <KpiRow label="הזמנות פתוחות" value={s.inPreparation + s.readyForDelivery + s.shipped} />
            <KpiDivider />
            <KpiRow label="שולם היום" value={formatCurrency(s.revenueToday)} accent="#065F46" />
            <KpiDivider />
            <KpiRow label="נמסר היום" value={`${s.deliveriesDelivered}/${s.deliveriesToday || '—'}`} />
            <KpiDivider />
            <KpiRow label="מלאי" value={s.lowInventory === 0 ? '✓ תקין' : `${s.lowInventory} נמוכים`} accent={s.lowInventory === 0 ? '#065F46' : '#B45309'} />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2">
            <QuickPill label="הזמנה חדשה" href="/orders/new" icon="plus" />
            <QuickPill label="לקוח חדש" href="/customers/new" icon="user" />
            <QuickPill label="כל ההזמנות" href="/orders" icon="list" />
            <QuickPill label="מלאי" href="/inventory" icon="box" />
          </div>
        </aside>
      </section>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, accent, tint, sub, href }: {
  icon: string;
  label: string;
  value: string;
  accent: string;
  tint?: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div
      className="rounded-2xl p-4 transition-all hover:-translate-y-px hover:shadow-sm h-full"
      style={{
        backgroundColor: tint ?? '#FFFFFF',
        border: '1px solid #EAE0D4',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9B7A5A' }}>{label}</p>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}1A`, color: accent }}>
          <Icon name={icon} className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none" style={{ color: '#2B1A10', letterSpacing: '0.2px' }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-2" style={{ color: '#9B7A5A' }}>{sub}</p>
      )}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

function KpiRow({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" style={{ color: '#6B4A2D' }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: accent ?? '#2B1A10' }}>
        {value}
      </span>
    </div>
  );
}

function KpiDivider() {
  return <div className="h-px" style={{ backgroundColor: '#F5ECD8' }} />;
}

function QuickPill({ label, href, icon }: { label: string; href: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white transition-colors hover:bg-amber-50/60"
      style={{ border: '1px solid #EAE0D4' }}
    >
      <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F5EDE3', color: '#8B5E34' }}>
        <Icon name={icon} className="w-3 h-3" />
      </span>
      <span className="text-xs font-medium truncate" style={{ color: '#2B1A10' }}>{label}</span>
    </Link>
  );
}

// Compact inline empty-state — replaces the old big illustrated panels.
function EmptyInline({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-6 justify-center">
      <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF5E9', color: '#9B7A5A' }}>
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <span className="text-xs" style={{ color: '#9B7A5A' }}>{text}</span>
    </div>
  );
}
