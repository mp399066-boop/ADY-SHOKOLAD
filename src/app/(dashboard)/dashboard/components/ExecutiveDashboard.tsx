'use client';

// Executive management dashboard — 3-second business status view.
// Receives all props from page.tsx. No data fetching here.
// Charts: pure SVG — no external library needed.

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { C } from './theme';
import { formatCurrency } from '@/lib/utils';
import type { TodayOrder, Delivery, Stock } from './types';
import type { DashboardStats } from '@/types/database';
import type { QueueItem, QueueEntity } from './queue-builder';
import { DashboardInventoryAlerts } from './DashboardInventoryAlerts';
import { DashboardEmployeeTasks } from './DashboardEmployeeTasks';
import { AttentionPanel } from './AttentionPanel';

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function fmtDayShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'short' });
}

function entityHref(entity: QueueEntity | undefined): string {
  if (!entity) return '/orders';
  if (entity.kind === 'order') return `/orders/${entity.data.id}`;
  if (entity.kind === 'delivery') {
    const orderId = entity.data.הזמנות?.id;
    return orderId ? `/orders/${orderId}` : '/deliveries';
  }
  return '/orders';
}

// ── SVG Donut ────────────────────────────────────────────────────────────────

interface DonutSlice { label: string; count: number; color: string; softColor: string; }

function computeSegments(slices: DonutSlice[], r: number) {
  const total = slices.reduce((s, sl) => s + sl.count, 0);
  if (total === 0) return { segments: [], total: 0, circ: 2 * Math.PI * r };
  const circ = 2 * Math.PI * r;
  let cum = 0;
  const segments = slices.filter(sl => sl.count > 0).map(sl => {
    const frac = sl.count / total;
    const arc = frac * circ;
    const offset = cum * circ;
    cum += frac;
    return { ...sl, arc, offset, circ, frac };
  });
  return { segments, total, circ };
}

function OrderStatusDonut({ slices }: { slices: DonutSlice[] }) {
  const SIZE = 96;
  const r = SIZE / 2 - 10;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const { segments, total, circ } = computeSegments(slices, r);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.borderSoft} strokeWidth={12} />
          ) : segments.map((seg, i) => (
            <circle key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={12}
              strokeDasharray={`${seg.arc} ${circ - seg.arc}`}
              strokeDashoffset={-seg.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-bold tabular-nums leading-none" style={{ color: C.text }}>{total}</span>
          <span className="text-[9px] font-semibold" style={{ color: C.textMuted }}>הזמנות</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        {slices.filter(sl => sl.count > 0).map(sl => (
          <div key={sl.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sl.color }} />
            <span className="text-[11px] truncate" style={{ color: C.textSoft }}>{sl.label}</span>
            <span className="text-[11px] font-bold tabular-nums mr-auto" style={{ color: C.text }}>{sl.count}</span>
          </div>
        ))}
        {total === 0 && (
          <span className="text-[11px]" style={{ color: C.textMuted }}>אין הזמנות פעילות</span>
        )}
      </div>
    </div>
  );
}

// ── 7-day delivery schedule bars ─────────────────────────────────────────────

function DeliveryScheduleBars({ activeOrders }: { activeOrders: TodayOrder[] }) {
  const today = todayISO();
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [today]);

  const counts = useMemo(() => days.map(day =>
    activeOrders.filter(o => {
      const od = o.תאריך_אספקה;
      return od && String(od).slice(0, 10) === day;
    }).length
  ), [days, activeOrders]);

  const maxCount = Math.max(...counts, 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1.5 h-14">
        {days.map((day, i) => {
          const isToday = day === today;
          const h = Math.max((counts[i] / maxCount) * 48, counts[i] > 0 ? 6 : 2);
          return (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <span
                className="text-[9px] font-bold tabular-nums"
                style={{ color: counts[i] > 0 ? C.text : C.textMuted }}
              >
                {counts[i] > 0 ? counts[i] : ''}
              </span>
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${h}px`,
                  backgroundColor: isToday ? C.brand : counts[i] > 0 ? C.brandSoft : C.borderSoft,
                  border: isToday ? `1px solid ${C.brand}` : `1px solid ${C.borderSoft}`,
                  minHeight: '2px',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-1.5">
        {days.map((day, i) => {
          const isToday = day === today;
          return (
            <div key={day} className="flex-1 flex flex-col items-center">
              <span
                className="text-[9px] font-semibold truncate w-full text-center"
                style={{ color: isToday ? C.brand : C.textMuted }}
              >
                {isToday ? 'היום' : fmtDayShort(day)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent, softBg, icon, onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  softBg: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`relative overflow-hidden flex items-start gap-3 rounded-xl p-3 w-full text-right transition-all ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
        style={{ backgroundColor: softBg, color: accent }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold mb-0.5 truncate" style={{ color: C.textMuted }}>{label}</p>
        <p className="text-[20px] font-bold tabular-nums leading-none" style={{ color: C.text }}>{value}</p>
        {sub && <p className="text-[10px] mt-1 truncate" style={{ color: C.textSoft }}>{sub}</p>}
      </div>
    </Tag>
  );
}

// ── Attention list ────────────────────────────────────────────────────────────

function AttentionList({ items, onNavigate }: { items: QueueItem[]; onNavigate: (path: string) => void }) {
  const visible = items.slice(0, 5);
  const typeLabel: Record<string, string> = {
    order: 'הזמנה',
    delivery: 'משלוח',
    payment: 'תשלום',
    stock: 'מלאי',
  };
  const typeColor: Record<string, string> = {
    order: C.brand,
    delivery: C.blue,
    payment: C.amber,
    stock: C.red,
  };

  if (visible.length === 0) {
    return (
      <div className="flex items-center justify-center h-full py-6 rounded-lg" style={{ backgroundColor: C.greenSoft }}>
        <span className="text-[12px] font-semibold" style={{ color: C.green }}>הכל תקין</span>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {visible.map(item => {
        const href = entityHref(item.entity);
        const label = typeLabel[item.type] ?? item.type;
        const color = typeColor[item.type] ?? C.textSoft;
        return (
          <li key={item.id}>
            <Link
              href={href}
              className="flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors hover:opacity-80"
              style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
            >
              <span
                className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `${color}18`, color }}
              >
                {label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] font-semibold truncate" style={{ color: C.text }}>{item.title}</p>
                {item.meta && <p className="text-[10px] truncate" style={{ color: C.textMuted }}>{item.meta}</p>}
              </div>
              <span className="text-[11px] flex-shrink-0 mt-0.5" style={{ color: C.textMuted }}>←</span>
            </Link>
          </li>
        );
      })}
      {items.length > 5 && (
        <li>
          <Link
            href="/orders"
            className="flex items-center justify-center text-[11px] font-semibold py-1.5 transition-opacity hover:opacity-70"
            style={{ color: C.textSoft }}
          >
            עוד {items.length - 5} פריטים ←
          </Link>
        </li>
      )}
    </ul>
  );
}

// ── Compact production summary (totals only, no tables) ──────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

interface CompactProdData { orders_count: number; productsTotal: number; packagesTotal: number; petitFoursTotal: number; }

function CompactProductionSummary() {
  const [data, setData]       = useState<CompactProdData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const e = new Date(t); e.setDate(e.getDate() + 6);
    fetch(`/api/production-summary?date_from=${toISO(t)}&date_to=${toISO(e)}`)
      .then(r => r.json())
      .then(json => {
        if (!json.error) setData({
          orders_count:    json.orders_count ?? 0,
          productsTotal:   (json.products   ?? []).reduce((s: number, p: { כמות_כוללת: number }) => s + p.כמות_כוללת, 0),
          packagesTotal:   (json.packages   ?? []).reduce((s: number, p: { כמות_כוללת: number }) => s + p.כמות_כוללת, 0),
          petitFoursTotal: (json.petit_fours ?? []).reduce((s: number, p: { כמות_כוללת: number }) => s + p.כמות_כוללת, 0),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasItems = data && (data.productsTotal > 0 || data.packagesTotal > 0 || data.petitFoursTotal > 0);

  return (
    <section
      className="rounded-xl p-3"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[12.5px] font-bold" style={{ color: C.textSoft }}>לייצור השבוע</h2>
        {data && data.orders_count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: C.goldSoft, color: C.amber }}>
            {data.orders_count} הז׳
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.borderSoft, borderTopColor: C.brand }} />
        </div>
      ) : !hasItems ? (
        <p className="text-[11px] py-1" style={{ color: C.textMuted }}>אין הזמנות פעילות</p>
      ) : (
        <div className="space-y-1.5">
          {(data!.productsTotal > 0) && (
            <div className="flex items-center justify-between">
              <span className="text-[11.5px]" style={{ color: C.textSoft }}>מוצרים</span>
              <span className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: C.brandSoft, color: C.brand }}>{data!.productsTotal}</span>
            </div>
          )}
          {(data!.packagesTotal > 0) && (
            <div className="flex items-center justify-between">
              <span className="text-[11.5px]" style={{ color: C.textSoft }}>מארזים</span>
              <span className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: C.brandSoft, color: C.brand }}>{data!.packagesTotal}</span>
            </div>
          )}
          {(data!.petitFoursTotal > 0) && (
            <div className="flex items-center justify-between">
              <span className="text-[11.5px]" style={{ color: C.textSoft }}>פטיפורים</span>
              <span className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: '#EDE9FE', color: '#5B21B6' }}>{data!.petitFoursTotal}</span>
            </div>
          )}
        </div>
      )}

      <Link
        href="/production-summary"
        className="mt-2 flex items-center justify-center text-[11px] font-semibold pt-2 transition-opacity hover:opacity-70"
        style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
      >
        סיכום מלא ←
      </Link>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExecutiveDashboard({
  stats,
  activeOrders,
  todayDeliveries,
  stock,
  urgentItems,
  onNavigate,
}: {
  stats: DashboardStats | null;
  activeOrders: TodayOrder[];
  todayDeliveries: Delivery[];
  stock: Stock;
  urgentItems: QueueItem[];
  onNavigate: (path: string) => void;
}) {
  void todayDeliveries; // available for future use

  const liveOrders = useMemo(
    () => activeOrders.filter(o =>
      o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה',
    ),
    [activeOrders],
  );

  const donutSlices: DonutSlice[] = useMemo(() => {
    const counts: Record<string, number> = { 'חדשה': 0, 'בהכנה': 0, 'מוכנה למשלוח': 0, 'נשלחה': 0 };
    for (const o of liveOrders) {
      if (o.סטטוס_הזמנה in counts) counts[o.סטטוס_הזמנה]++;
    }
    return [
      { label: 'חדשה',             count: counts['חדשה'],             color: C.gold,  softColor: C.goldSoft  },
      { label: 'בהכנה',            count: counts['בהכנה'],            color: C.brand, softColor: C.brandSoft },
      { label: 'מוכנה למשלוח',    count: counts['מוכנה למשלוח'],    color: C.green, softColor: C.greenSoft },
      { label: 'נשלחה',            count: counts['נשלחה'],            color: C.blue,  softColor: C.blueSoft  },
    ];
  }, [liveOrders]);

  const activeCount  = liveOrders.length;
  const urgentCount  = stats?.urgentOrders ?? urgentItems.length;
  const deliveryCount = stats?.deliveriesToday ?? 0;
  const unpaidAmount  = stats?.unpaidAmount ?? 0;
  const unpaidCount   = stats?.unpaidOrders ?? 0;
  const revenueToday  = stats?.revenueToday ?? 0;

  return (
    <div className="space-y-2">

      {/* ── KPI Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        <KpiCard
          label="הכנסות היום"
          value={formatCurrency(revenueToday)}
          sub="תשלומים שהתקבלו"
          accent={C.gold}
          softBg={C.goldSoft}
          onClick={() => onNavigate('/orders?filter=today')}
          icon={
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <KpiCard
          label="ממתין לתשלום"
          value={formatCurrency(unpaidAmount)}
          sub={unpaidCount > 0 ? `${unpaidCount} הזמנות פתוחות` : 'הכל סגור'}
          accent={unpaidCount > 0 ? C.amber : C.green}
          softBg={unpaidCount > 0 ? C.amberSoft : C.greenSoft}
          onClick={unpaidCount > 0 ? () => onNavigate('/orders?filter=unpaid') : undefined}
          icon={
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          }
        />
        <KpiCard
          label="הזמנות פעילות"
          value={String(activeCount)}
          sub={`${stats?.inPreparation ?? 0} בהכנה, ${stats?.readyForDelivery ?? 0} מוכנות`}
          accent={C.brand}
          softBg={C.brandSoft}
          onClick={() => onNavigate('/orders')}
          icon={
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          }
        />
        <KpiCard
          label="דחוף עכשיו"
          value={String(urgentCount)}
          sub={urgentCount > 0 ? 'דורש טיפול מיידי' : 'הכל תקין'}
          accent={urgentCount > 0 ? C.red : C.green}
          softBg={urgentCount > 0 ? C.redSoft : C.greenSoft}
          onClick={urgentCount > 0 ? () => onNavigate('/orders') : undefined}
          icon={
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
        <KpiCard
          label="משלוחים היום"
          value={String(deliveryCount)}
          sub={`${stats?.deliveriesCollected ?? 0} נאספו, ${stats?.deliveriesDelivered ?? 0} נמסרו`}
          accent={C.blue}
          softBg={C.blueSoft}
          onClick={() => onNavigate('/deliveries')}
          icon={
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="1" />
              <path d="M16 8h4l3 3v5h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          }
        />
      </div>

      {/* ── Analytics + Attention ─────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">

        {/* Order status donut */}
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>סטטוס הזמנות</h2>
          <OrderStatusDonut slices={donutSlices} />
          <Link
            href="/orders"
            className="mt-3 flex items-center justify-center text-[11px] font-semibold pt-2.5 transition-opacity hover:opacity-70"
            style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
          >
            כל ההזמנות הפעילות ←
          </Link>
        </section>

        {/* 7-day delivery schedule */}
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-bold" style={{ color: C.textSoft }}>לוח אספקות — 7 ימים קדימה</h2>
          </div>
          <DeliveryScheduleBars activeOrders={liveOrders} />
          <Link
            href="/orders"
            className="mt-3 flex items-center justify-center text-[11px] font-semibold pt-2.5 transition-opacity hover:opacity-70"
            style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
          >
            עמוד הזמנות ←
          </Link>
        </section>

        {/* Attention items */}
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-bold" style={{ color: C.textSoft }}>דורש טיפול</h2>
            {urgentItems.length > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold"
                style={{ backgroundColor: C.redSoft, color: C.red }}
              >
                {urgentItems.length}
              </span>
            )}
          </div>
          <AttentionList items={urgentItems} onNavigate={onNavigate} />
        </section>
      </div>

      {/* ── Secondary insights — compact 4-card row ─────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 items-start">
        <CompactProductionSummary />
        <DashboardInventoryAlerts stock={stock} />
        <DashboardEmployeeTasks />
        <AttentionPanel />
      </div>

    </div>
  );
}
