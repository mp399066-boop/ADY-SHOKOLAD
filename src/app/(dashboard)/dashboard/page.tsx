'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/utils';
import type { DashboardStats, Order } from '@/types/database';

/* ─── stat card ──────────────────────────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: number;
  href: string;
  filterParam?: string;
  accent?: string;
  urgent?: boolean;
  icon: React.ReactNode;
}

function StatCard({ label, value, href, filterParam, accent = '#8B5E34', urgent, icon }: StatCardProps) {
  const url = filterParam ? `${href}?filter=${filterParam}` : href;
  return (
    <Link href={url}>
      <div
        className="bg-white rounded-2xl p-5 premium-card transition-all cursor-pointer group relative overflow-hidden"
        style={{
          border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}14`, color: accent }}
          >
            {icon}
          </div>
          {urgent && value > 0 && (
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse flex-shrink-0 mt-1" />
          )}
        </div>
        <div className="text-2xl font-semibold tabular-nums" style={{ color: '#2B1A10', letterSpacing: '-0.5px' }}>{value}</div>
        <div className="text-xs mt-1 font-normal" style={{ color: '#9B8472', letterSpacing: '0.2px' }}>{label}</div>
        <div
          className="absolute bottom-0 right-0 left-0 h-px w-0 group-hover:w-full transition-all duration-300 origin-right"
          style={{ backgroundColor: `${accent}60` }}
        />
      </div>
    </Link>
  );
}

/* ─── quick action card ──────────────────────────────────────────────────── */
function QuickAction({ label, href, icon }: { label: string; href: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <div
        className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-white premium-card transition-all cursor-pointer aspect-square"
        style={{ border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}
      >
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: '#F5EDE3', color: '#8B5E34' }}
        >
          {icon}
        </div>
        <span className="text-xs font-normal text-center" style={{ color: '#4A3525', letterSpacing: '0.2px' }}>{label}</span>
      </div>
    </Link>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/orders?filter=today&limit=100').then(r => r.json()),
    ]).then(([dashData, ordersData]) => {
      if (dashData.error) throw new Error(dashData.error);
      if (ordersData.error) throw new Error(ordersData.error);

      const s: DashboardStats = dashData.data;
      const orders: Order[] = ordersData.data || [];

      console.log('[Dashboard] הזמנות שנטענו (היום):', orders.length);
      console.log('[Dashboard] הזמנות להיום (stats):', s.ordersToday);
      console.log('[Dashboard] הזמנות למחר:', s.ordersTomorrow);
      console.log('[Dashboard] הזמנות דחופות:', s.urgentOrders);
      console.log('[Dashboard] משלוחים היום:', s.deliveriesToday);
      console.log('[Dashboard] מלאי נמוך:', s.lowInventory);

      setStats(s);
      setTodayOrders(orders);
    }).catch(err => {
      console.error('[Dashboard] שגיאה בטעינת נתוני הדשבורד:', err);
      setError('שגיאה בטעינת נתוני הדשבורד');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: '#FEE2E2' }}
        >
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); }}
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
  };

  const activeTasks = s.ordersToday + s.inPreparation;

  const statCards: StatCardProps[] = [
    {
      label: 'הזמנות להיום', value: s.ordersToday, href: '/orders', filterParam: 'today',
      accent: '#8B5E34',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>,
    },
    {
      label: 'הזמנות למחר', value: s.ordersTomorrow, href: '/orders', filterParam: 'tomorrow',
      accent: '#C7A46B',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
    },
    {
      label: 'הזמנות דחופות', value: s.urgentOrders, href: '/orders', filterParam: 'urgent',
      accent: '#C0392B', urgent: true,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg>,
    },
    {
      label: 'משלוחים היום', value: s.deliveriesToday, href: '/deliveries',
      accent: '#0891B2',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>,
    },
    {
      label: 'מלאי נמוך', value: s.lowInventory, href: '/inventory', urgent: true,
      accent: '#DC2626',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl pb-8">

      {/* ── greeting ── */}
      <div className="flex items-start justify-between">
        <div>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all hover:shadow-sm"
            style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeTasks > 0 ? '#C0392B' : '#2E7D32' }} />
            {activeTasks} משימות פעילות היום
          </button>
        </div>
        <div className="text-left" dir="rtl">
          <h1 className="text-3xl font-bold" style={{ color: '#2B1A10' }}>שלום!</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9B7A5A' }}>{dateStr}</p>
        </div>
      </div>

      {/* ── 5 stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(card => <StatCard key={card.label} {...card} />)}
      </div>

      {/* ── two columns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* left: quick actions */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>פעולות מהירות</h2>

          <div className="grid grid-cols-2 gap-3">
            <QuickAction
              label="לקוח חדש"
              href="/customers/new"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>}
            />
            <QuickAction
              label="הזמנה חדשה"
              href="/orders/new"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
            />
            <QuickAction
              label="מלאי"
              href="/inventory"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>}
            />
            <QuickAction
              label="כל ההזמנות"
              href="/orders"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>}
            />
          </div>

          {/* payment summary */}
          <Link href="/orders?filter=unpaid">
            <div
              className="rounded-2xl border p-4 bg-white hover:shadow-sm transition-all cursor-pointer"
              style={{ borderColor: '#EDE0CE' }}
            >
              <p className="text-xs mb-1" style={{ color: '#9B7A5A' }}>ממתין לתשלום</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: '#2B1A10' }}>
                {formatCurrency(s.unpaidAmount)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#9B7A5A' }}>
                מ-{s.unpaidOrders} הזמנות
              </p>
            </div>
          </Link>
        </div>

        {/* right: today's orders */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>הזמנות להיום</h2>
            <Link
              href="/orders?filter=today"
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: '#8B5E34' }}
            >
              <svg className="w-3.5 h-3.5 rtl-flip" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              צפה בכל ההזמנות
            </Link>
          </div>

          <div
            className="bg-white rounded-2xl border overflow-hidden"
            style={{ borderColor: '#EDE0CE', minHeight: '260px' }}
          >
            {todayOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#F0E6D6' }}
                >
                  <svg className="w-8 h-8" fill="none" stroke="#8B5E34" viewBox="0 0 24 24" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                </div>
                <p className="font-semibold text-sm mb-1" style={{ color: '#2B1A10' }}>אין הזמנות להיום</p>
                <p className="text-xs" style={{ color: '#9B7A5A' }}>יום שקט — אפשר להתפנות לעבודות אחרות</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                    {['הזמנה', 'לקוח', 'שעת אספקה', 'סטטוס', 'סכום'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todayOrders.map(order => {
                    const c = (order as Order & { לקוחות?: { שם_פרטי: string; שם_משפחה: string } }).לקוחות;
                    return (
                      <tr
                        key={order.id}
                        className="border-b hover:bg-amber-50 transition-colors cursor-pointer"
                        style={{ borderColor: '#F5ECD8' }}
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold" style={{ color: '#8B5E34' }}>{order.מספר_הזמנה}</span>
                            {order.הזמנה_דחופה && <UrgentBadge />}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>
                          {c ? `${c.שם_פרטי} ${c.שם_משפחה}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>
                          {order.שעת_אספקה || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.סטטוס_הזמנה} type="order" />
                        </td>
                        <td className="px-4 py-3 font-semibold text-xs" style={{ color: '#2B1A10' }}>
                          {formatCurrency(order.סך_הכל_לתשלום)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
