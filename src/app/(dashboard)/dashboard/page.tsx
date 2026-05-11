'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/utils';
import type { DashboardStats, Order } from '@/types/database';

// ─── Tiny inline icon set ──────────────────────────────────────────────────
// Same brand stroke weight as the order-detail icons. Keeps bundle slim.
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
    case 'flame':    return <svg {...props}><path d="M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3 2-4-1 3 1 4 2 4 0-3-1-6 1-10z"/></svg>;
    case 'wallet':   return <svg {...props}><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1 0-4h13"/><circle cx="17" cy="13" r="1"/></svg>;
    case 'check':    return <svg {...props}><path d="m5 13 4 4 10-10"/></svg>;
    case 'box':      return <svg {...props}><path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>;
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'user':     return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case 'list':     return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>;
    case 'arrow':    return <svg {...props}><path d="m15 6-6 6 6 6"/></svg>;
    case 'alert':    return <svg {...props}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>;
    case 'sparkle':  return <svg {...props}><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/></svg>;
    default:         return null;
  }
}

// ─── Helpers (UI-only — no business logic changes) ─────────────────────────

function nowHHMMInIsrael(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' });
}

// Sort orders by their שעת_אספקה (HH:MM string). Orders without a time go last.
function timeKey(t?: string | null): number {
  if (!t) return 24 * 60 + 1;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// "Next" order = the first order with שעת_אספקה ≥ now-time. If all passed, the
// earliest of the day. Returns null when list is empty.
function pickNextOrder(orders: TodayOrder[]): TodayOrder | null {
  if (orders.length === 0) return null;
  const sorted = [...orders].sort((a, b) => timeKey(a.שעת_אספקה) - timeKey(b.שעת_אספקה));
  const nowKey = (() => { const [h, m] = nowHHMMInIsrael().split(':').map(Number); return h * 60 + m; })();
  return sorted.find(o => timeKey(o.שעת_אספקה) >= nowKey) || sorted[0];
}

type TodayOrder = Order & {
  לקוחות?: { שם_פרטי: string; שם_משפחה: string };
  סוג_אספקה?: string;
  שעת_אספקה?: string | null;
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateStr = new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/orders?filter=today&limit=100').then(r => r.json()),
    ]).then(([dashData, ordersData]) => {
      if (dashData.error) throw new Error(dashData.error);
      if (ordersData.error) throw new Error(ordersData.error);
      setStats(dashData.data);
      setTodayOrders((ordersData.data || []) as TodayOrder[]);
    }).catch(() => {
      setError('שגיאה בטעינת נתוני הדשבורד');
    }).finally(() => setLoading(false));
  }, []);

  // Derived values — keep all client-side; no DB writes.
  const sortedToday = useMemo(
    () => [...todayOrders]
      .filter(o => o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה')
      .sort((a, b) => timeKey(a.שעת_אספקה) - timeKey(b.שעת_אספקה)),
    [todayOrders],
  );
  const deliveriesCount = useMemo(
    () => sortedToday.filter(o => o.סוג_אספקה === 'משלוח').length,
    [sortedToday],
  );
  const pickupsCount = useMemo(
    () => sortedToday.filter(o => o.סוג_אספקה !== 'משלוח').length,
    [sortedToday],
  );
  const expectedRevenue = useMemo(
    () => sortedToday.reduce((sum, o) => sum + (o.סך_הכל_לתשלום || 0), 0),
    [sortedToday],
  );
  const avgOrder = sortedToday.length > 0 ? expectedRevenue / sortedToday.length : 0;
  const nextOrder = useMemo(() => pickNextOrder(sortedToday), [sortedToday]);

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

  // Attention items — only render those with value > 0; if all zero, show
  // a single calm "all clear" pill instead of an empty wasteland of cards.
  const attention: { key: string; label: string; value: number | string; href: string; tone: 'red' | 'amber' | 'plum' }[] = [];
  if (s.urgentOrders > 0) attention.push({ key: 'urgent', label: 'הזמנות דחופות', value: s.urgentOrders, href: '/orders?filter=urgent', tone: 'red' });
  if (s.unpaidOrders > 0) attention.push({ key: 'unpaid', label: 'לא שולמו', value: s.unpaidOrders, href: '/orders?filter=unpaid', tone: 'amber' });
  if (s.lowInventory > 0) attention.push({ key: 'lowInv', label: 'מלאי נמוך', value: s.lowInventory, href: '/inventory', tone: 'red' });
  if (s.inPreparation > 0) attention.push({ key: 'prep', label: 'בהכנה', value: s.inPreparation, href: '/orders?filter=preparation', tone: 'plum' });
  if (s.readyForDelivery > 0) attention.push({ key: 'ready', label: 'מוכן למשלוח', value: s.readyForDelivery, href: '/orders?filter=ready', tone: 'amber' });

  const toneStyles: Record<'red' | 'amber' | 'plum', { bg: string; border: string; text: string; dot: string }> = {
    red:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', dot: '#DC2626' },
    amber: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', dot: '#D97706' },
    plum:  { bg: '#F5F0FA', border: '#DDD6FE', text: '#5B21B6', dot: '#7C3AED' },
  };

  return (
    <div dir="rtl" className="space-y-5 max-w-7xl pb-8">

      {/* ════════ GREETING ════════ */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ color: '#2B1A10' }}>שלום!</h1>
          <p className="text-sm mt-1" style={{ color: '#9B7A5A' }}>{dateStr}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors" style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}>
            <Icon name="plus" className="w-3.5 h-3.5" /> הזמנה חדשה
          </Link>
        </div>
      </header>

      {/* ════════ HERO — "היום שלך" ════════ */}
      <section
        className="rounded-2xl p-5 sm:p-6"
        style={{
          background: 'linear-gradient(135deg,#FFFDF8 0%,#FBF5EA 60%,#F5EDDD 100%)',
          border: '1px solid #EAE0D4',
          boxShadow: '0 2px 14px rgba(58,42,26,0.06)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EFE4D3', color: '#8B5E34' }}>
              <Icon name="sparkle" className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#8B5E34' }}>היום שלך</h2>
          </div>
          {sortedToday.length > 0 && (
            <Link href="/orders?filter=today" className="text-xs hover:underline flex items-center gap-1" style={{ color: '#8B5E34' }}>
              צפי כל ההזמנות <Icon name="arrow" className="w-3 h-3 rtl-flip" />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* HERO LEFT — revenue + counts */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>הכנסה צפויה היום</p>
              <p className="text-4xl sm:text-5xl font-bold tabular-nums leading-none" style={{ color: '#8B5E34', letterSpacing: '0.5px' }}>
                {formatCurrency(expectedRevenue)}
              </p>
              <p className="text-xs mt-2" style={{ color: '#6B4A2D' }}>
                {sortedToday.length === 0 ? 'אין הזמנות להיום' : `${sortedToday.length} הזמנות פעילות`}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <HeroCount icon="bag" label="הזמנות" value={sortedToday.length} accent="#8B5E34" />
              <HeroCount icon="truck" label="משלוחים" value={deliveriesCount} accent="#0891B2" />
              <HeroCount icon="box" label="איסוף" value={pickupsCount} accent="#D97706" />
            </div>
          </div>

          {/* HERO MIDDLE — next order */}
          <div className="lg:col-span-4">
            <NextOrderCard order={nextOrder} />
          </div>

          {/* HERO RIGHT — money status */}
          <div className="lg:col-span-3 space-y-2">
            <Link href="/orders?filter=unpaid">
              <div
                className="rounded-xl p-3 transition-colors hover:bg-rose-50/40"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE0D4' }}
              >
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>ממתין לתשלום</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: s.unpaidOrders > 0 ? '#B91C1C' : '#2B1A10' }}>
                  {formatCurrency(s.unpaidAmount)}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: '#9B7A5A' }}>{s.unpaidOrders} הזמנות</p>
              </div>
            </Link>
            <div className="rounded-xl p-3" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#065F46' }}>שולם היום</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: '#065F46' }}>
                {formatCurrency(s.revenueToday)}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: '#047857' }}>הזמנות שולמו</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ ATTENTION STRIP ════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>מה דורש טיפול</h2>
          {attention.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
              {attention.reduce((sum, a) => sum + (typeof a.value === 'number' ? a.value : 0), 0)}
            </span>
          )}
        </div>
        {attention.length === 0 ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#065F46' }}
          >
            <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#DCFCE7' }}>
              <Icon name="check" className="w-4 h-4" />
            </span>
            <span className="font-medium">הכל תחת בקרה — אין משימות דחופות</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {attention.map(a => {
              const t = toneStyles[a.tone];
              return (
                <Link
                  key={a.key}
                  href={a.href}
                  className="rounded-xl p-3 transition-all hover:shadow-sm"
                  style={{ backgroundColor: t.bg, border: `1px solid ${t.border}` }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.dot }} />
                    <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: t.text }}>{a.value}</span>
                  </div>
                  <p className="text-xs font-medium" style={{ color: t.text }}>{a.label}</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ════════ MAIN GRID — Timeline + KPIs/Quick actions ════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* TIMELINE — 2/3 */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>לוח זמנים — היום</h2>
            <Link href="/orders?filter=tomorrow" className="text-xs hover:underline" style={{ color: '#8B5E34' }}>
              מחר ({s.ordersTomorrow})
            </Link>
          </div>
          <div
            className="bg-white rounded-2xl overflow-hidden"
            style={{ border: '1px solid #EAE0D4', boxShadow: '0 1px 6px rgba(58,42,26,0.04)' }}
          >
            {sortedToday.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: '#F0E6D6' }}>
                  <Icon name="clock" className="w-7 h-7" />
                </div>
                <p className="font-semibold text-sm mb-1" style={{ color: '#2B1A10' }}>אין הזמנות להיום</p>
                <p className="text-xs" style={{ color: '#9B7A5A' }}>יום שקט — אפשר להתפנות לעבודות אחרות</p>
              </div>
            ) : (
              <ul>
                {sortedToday.map((order, idx) => {
                  const c = order.לקוחות;
                  const fullName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : '—';
                  const isDelivery = order.סוג_אספקה === 'משלוח';
                  const isLast = idx === sortedToday.length - 1;
                  return (
                    <li
                      key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-amber-50/60"
                      style={{ borderBottom: isLast ? 'none' : '1px solid #F5ECD8' }}
                    >
                      {/* time pill */}
                      <div className="flex-shrink-0 text-center w-14">
                        <p className="text-sm font-bold tabular-nums" style={{ color: '#2B1A10' }}>
                          {order.שעת_אספקה || '—:—'}
                        </p>
                      </div>
                      {/* type icon */}
                      <span
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: isDelivery ? '#E0F2FE' : '#FEF3C7',
                          color: isDelivery ? '#0369A1' : '#92400E',
                        }}
                        title={isDelivery ? 'משלוח' : 'איסוף עצמי'}
                      >
                        <Icon name={isDelivery ? 'truck' : 'box'} className="w-4 h-4" />
                      </span>
                      {/* main */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold truncate" style={{ color: '#2B1A10' }}>{fullName}</span>
                          {order.הזמנה_דחופה && <UrgentBadge />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: '#6B4A2D' }}>
                          <span className="font-mono">{order.מספר_הזמנה}</span>
                          <span>·</span>
                          <span>{isDelivery ? 'משלוח' : 'איסוף עצמי'}</span>
                        </div>
                      </div>
                      {/* status + amount */}
                      <div className="flex-shrink-0 flex items-center gap-3">
                        <StatusBadge status={order.סטטוס_הזמנה} type="order" />
                        <span className="text-sm font-bold tabular-nums w-20 text-left" style={{ color: '#8B5E34' }}>
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

        {/* SIDEBAR — KPIs + quick actions */}
        <aside className="space-y-5">
          {/* KPIs */}
          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: '#2B1A10' }}>מדדים</h2>
            <div
              className="bg-white rounded-2xl p-4 space-y-3"
              style={{ border: '1px solid #EAE0D4', boxShadow: '0 1px 6px rgba(58,42,26,0.04)' }}
            >
              <KpiRow label="הזמנות פתוחות" value={s.inPreparation + s.readyForDelivery + s.shipped} suffix="הזמנות" />
              <KpiDivider />
              <KpiRow label="ממוצע הזמנה היום" value={formatCurrency(avgOrder)} muted={sortedToday.length === 0} />
              <KpiDivider />
              <KpiRow label="משלוחים שנמסרו היום" value={s.deliveriesDelivered} suffix={`/ ${s.deliveriesToday}`} />
              <KpiDivider />
              <KpiRow label="מלאי במצב תקין" value={s.lowInventory === 0 ? '✓ הכל תקין' : `${s.lowInventory} פריטים נמוכים`} muted={s.lowInventory === 0} />
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: '#2B1A10' }}>פעולות מהירות</h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickPill label="הזמנה חדשה" href="/orders/new" icon="plus" />
              <QuickPill label="לקוח חדש" href="/customers/new" icon="user" />
              <QuickPill label="כל ההזמנות" href="/orders" icon="list" />
              <QuickPill label="מלאי" href="/inventory" icon="box" />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function HeroCount({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE0D4' }}>
      <div className="flex items-center justify-between">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14`, color: accent }}>
          <Icon name={icon} className="w-4 h-4" />
        </span>
        <span className="text-xl font-bold tabular-nums" style={{ color: '#2B1A10' }}>{value}</span>
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: '#9B7A5A' }}>{label}</p>
    </div>
  );
}

function NextOrderCard({ order }: { order: TodayOrder | null }) {
  if (!order) {
    return (
      <div
        className="h-full rounded-xl p-4 flex flex-col items-center justify-center text-center"
        style={{ backgroundColor: '#FFFFFF', border: '1px dashed #DDD0BC', minHeight: 140 }}
      >
        <Icon name="clock" className="w-6 h-6" />
        <p className="text-xs mt-2" style={{ color: '#9B7A5A' }}>אין הזמנה הבאה היום</p>
      </div>
    );
  }
  const c = (order as TodayOrder).לקוחות;
  const fullName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : '—';
  const isDelivery = order.סוג_אספקה === 'משלוח';
  return (
    <Link href={`/orders/${order.id}`}>
      <div
        className="h-full rounded-xl p-4 transition-all hover:shadow-md cursor-pointer flex flex-col"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE0D4', minHeight: 140 }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#8B5E34' }}>הבאה בתור</p>
          {order.הזמנה_דחופה && <UrgentBadge />}
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-bold tabular-nums" style={{ color: '#2B1A10' }}>{order.שעת_אספקה || '—:—'}</span>
          <span className="text-xs" style={{ color: '#9B7A5A' }}>· {isDelivery ? 'משלוח' : 'איסוף'}</span>
        </div>
        <p className="text-sm font-semibold truncate" style={{ color: '#2B1A10' }}>{fullName}</p>
        <div className="mt-auto flex items-end justify-between pt-3">
          <span className="font-mono text-[11px]" style={{ color: '#9B7A5A' }}>{order.מספר_הזמנה}</span>
          <span className="text-base font-bold tabular-nums" style={{ color: '#8B5E34' }}>
            {formatCurrency(order.סך_הכל_לתשלום)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function KpiRow({ label, value, suffix, muted }: { label: string; value: number | string; suffix?: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" style={{ color: '#6B4A2D' }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: muted ? '#9B7A5A' : '#2B1A10' }}>
        {value}
        {suffix && <span className="text-[11px] font-normal ms-1" style={{ color: '#9B7A5A' }}>{suffix}</span>}
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
      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F5EDE3', color: '#8B5E34' }}>
        <Icon name={icon} className="w-3.5 h-3.5" />
      </span>
      <span className="text-xs font-medium truncate" style={{ color: '#2B1A10' }}>{label}</span>
    </Link>
  );
}
