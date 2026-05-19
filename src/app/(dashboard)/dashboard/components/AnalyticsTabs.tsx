'use client';

import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import { C } from './theme';
import { formatCurrency } from '@/lib/utils';
import type { TodayOrder, Delivery } from './types';
import type { QueueItem, QueueEntity } from './queue-builder';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Drill-down modal ──────────────────────────────────────────────────────────

interface DrillItem {
  id: string;
  href: string;
  primary: string;
  secondary?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  amount?: number;
  amountColor?: string;
}

type DrillState = {
  title: string;
  subtitle?: string;
  items: DrillItem[];
  allHref?: string;
  allLabel?: string;
} | null;

function DrillModal({ state, onClose }: { state: NonNullable<DrillState>; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(47,27,20,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          boxShadow: '0 12px 40px rgba(47,27,20,0.22)',
          maxHeight: '80vh',
        }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: `1px solid ${C.borderSoft}` }}
        >
          <div>
            <h3 className="text-[13px] font-bold" style={{ color: C.text }}>{state.title}</h3>
            {state.subtitle && (
              <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{state.subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full text-[12px] flex-shrink-0 mt-0.5 transition-opacity hover:opacity-70"
            style={{ backgroundColor: C.surface, color: C.textSoft }}
          >
            ✕
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {state.items.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <span className="text-[12px]" style={{ color: C.textMuted }}>אין נתונים</span>
            </div>
          ) : (
            <ul className="p-3 space-y-1">
              {state.items.map(item => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-opacity hover:opacity-75"
                    style={{ backgroundColor: C.surface, border: `1px solid ${C.borderSoft}` }}
                  >
                    <span className="text-[11px] font-medium truncate flex-1" style={{ color: C.text }}>
                      {item.primary}
                    </span>
                    {item.secondary && (
                      <span className="text-[9.5px] flex-shrink-0 tabular-nums" style={{ color: C.textMuted }}>
                        {item.secondary}
                      </span>
                    )}
                    {item.badge && (
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{ backgroundColor: item.badgeBg ?? C.brandSoft, color: item.badgeColor ?? C.brand }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.amount !== undefined && (
                      <span
                        className="text-[11px] font-bold tabular-nums flex-shrink-0"
                        style={{ color: item.amountColor ?? C.green }}
                      >
                        {formatCurrency(item.amount)}
                      </span>
                    )}
                    <span className="text-[10px] flex-shrink-0" style={{ color: C.textMuted }}>←</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {state.allHref && (
          <div className="flex-shrink-0" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
            <Link
              href={state.allHref}
              onClick={onClose}
              className="flex items-center justify-center py-2.5 text-[11px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: C.brand }}
            >
              {state.allLabel ?? 'לכל ההזמנות'} ←
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drill-down item converters ────────────────────────────────────────────────

function orderToDrillItem(o: TodayOrder): DrillItem {
  const name = o.לקוחות
    ? `${o.לקוחות.שם_פרטי} ${o.לקוחות.שם_משפחה}`.trim()
    : (o.שם_מקבל || '—');
  return {
    id:          o.id,
    href:        `/orders/${o.id}`,
    primary:     name,
    secondary:   o.תאריך_אספקה ? String(o.תאריך_אספקה).slice(5).replace('-', '/') : undefined,
    badge:       o.סטטוס_הזמנה || undefined,
    amount:      o.סך_הכל_לתשלום ?? undefined,
    amountColor: C.brand,
  };
}

function deliveryToDrillItem(d: Delivery): DrillItem {
  const o = d.הזמנות;
  const name = o?.לקוחות
    ? `${o.לקוחות.שם_פרטי} ${o.לקוחות.שם_משפחה}`.trim()
    : (o?.שם_מקבל || '—');
  const isReal = !d._noRecord && !d.id.startsWith('no-record-');
  return {
    id:      d.id,
    href:    isReal ? `/deliveries?highlight=${encodeURIComponent(d.id)}` : '/deliveries',
    primary: name,
    secondary: d.עיר || undefined,
    badge:   d.סטטוס_משלוח || undefined,
    badgeBg: C.blueSoft,
    badgeColor: C.blue,
  };
}

function finRowToDrillItem(o: FinOrderRow): DrillItem {
  return {
    id:          o.id,
    href:        `/orders/${o.id}`,
    primary:     o.customerName,
    secondary:   o.date ? o.date.slice(5).replace('-', '/') : undefined,
    badge:       o.paymentMethod || undefined,
    amount:      o.amount,
    amountColor: C.brand,
  };
}

// ── SVG Donut ─────────────────────────────────────────────────────────────────

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

function OrderStatusDonut({
  slices,
  onLegendClick,
}: {
  slices: DonutSlice[];
  onLegendClick?: (label: string) => void;
}) {
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
          <div key={sl.label}>
            {onLegendClick ? (
              <button
                type="button"
                onClick={() => onLegendClick(sl.label)}
                className="flex items-center gap-1.5 w-full rounded-md px-1 py-0.5 transition-all hover:opacity-70"
                style={{ cursor: 'pointer' }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sl.color }} />
                <span className="text-[11px] truncate" style={{ color: C.textSoft }}>{sl.label}</span>
                <span className="text-[11px] font-bold tabular-nums mr-auto" style={{ color: C.text }}>{sl.count}</span>
                <span className="text-[9px]" style={{ color: C.textMuted }}>←</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sl.color }} />
                <span className="text-[11px] truncate" style={{ color: C.textSoft }}>{sl.label}</span>
                <span className="text-[11px] font-bold tabular-nums mr-auto" style={{ color: C.text }}>{sl.count}</span>
              </div>
            )}
          </div>
        ))}
        {total === 0 && (
          <span className="text-[11px]" style={{ color: C.textMuted }}>אין הזמנות פעילות</span>
        )}
      </div>
    </div>
  );
}

// ── 7-day delivery schedule bars ──────────────────────────────────────────────

function DeliveryScheduleBars({
  activeOrders,
  onDayClick,
}: {
  activeOrders: TodayOrder[];
  onDayClick?: (day: string) => void;
}) {
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
          const col = (
            <div className="flex-1 flex flex-col items-center gap-1">
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
          return onDayClick && counts[i] > 0 ? (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick(day)}
              className="flex-1 flex flex-col items-center gap-1 transition-opacity hover:opacity-70"
              style={{ cursor: 'pointer' }}
            >
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
            </button>
          ) : (
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
          void col; // suppress unused var warning
        })}
      </div>
      <div className="flex items-start gap-1.5">
        {days.map((day) => {
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

// ── Tab infrastructure ────────────────────────────────────────────────────────

type TabId = 'orders' | 'finance' | 'deliveries';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'orders',     label: 'הזמנות'   },
  { id: 'finance',    label: 'פיננסיים' },
  { id: 'deliveries', label: 'משלוחים'  },
];

// ── Orders tab ────────────────────────────────────────────────────────────────

function OrdersTab({
  liveOrders,
  urgentItems,
  onNavigate,
}: {
  liveOrders: TodayOrder[];
  urgentItems: QueueItem[];
  onNavigate: (path: string) => void;
}) {
  const [drill, setDrill] = useState<DrillState>(null);

  const donutSlices: DonutSlice[] = useMemo(() => {
    const counts: Record<string, number> = { 'חדשה': 0, 'בהכנה': 0, 'מוכנה למשלוח': 0, 'נשלחה': 0 };
    for (const o of liveOrders) {
      if (o.סטטוס_הזמנה in counts) counts[o.סטטוס_הזמנה]++;
    }
    return [
      { label: 'חדשה',           count: counts['חדשה'],           color: C.gold,  softColor: C.goldSoft  },
      { label: 'בהכנה',          count: counts['בהכנה'],          color: C.brand, softColor: C.brandSoft },
      { label: 'מוכנה למשלוח',  count: counts['מוכנה למשלוח'],  color: C.green, softColor: C.greenSoft },
      { label: 'נשלחה',          count: counts['נשלחה'],          color: C.blue,  softColor: C.blueSoft  },
    ];
  }, [liveOrders]);

  const openByStatus = (label: string) => {
    const filtered = liveOrders.filter(o => o.סטטוס_הזמנה === label);
    if (filtered.length === 0) return;
    setDrill({
      title: `הזמנות — ${label}`,
      subtitle: `${filtered.length} הזמנות`,
      items: filtered.map(orderToDrillItem),
      allHref: '/orders',
    });
  };

  const openByDay = (day: string) => {
    const filtered = liveOrders.filter(o => o.תאריך_אספקה && String(o.תאריך_אספקה).slice(0, 10) === day);
    if (filtered.length === 0) return;
    const label = day === todayISO() ? 'היום' : day.slice(5).replace('-', '/');
    setDrill({
      title: `אספקות — ${label}`,
      subtitle: `${filtered.length} הזמנות`,
      items: filtered.map(orderToDrillItem),
      allHref: '/orders',
    });
  };

  return (
    <>
      {drill && <DrillModal state={drill} onClose={() => setDrill(null)} />}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>סטטוס הזמנות</h2>
          <OrderStatusDonut slices={donutSlices} onLegendClick={openByStatus} />
          <Link
            href="/orders"
            className="mt-3 flex items-center justify-center text-[11px] font-semibold pt-2.5 transition-opacity hover:opacity-70"
            style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
          >
            כל ההזמנות הפעילות ←
          </Link>
        </section>

        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-bold" style={{ color: C.textSoft }}>לוח אספקות — 7 ימים קדימה</h2>
          </div>
          <DeliveryScheduleBars activeOrders={liveOrders} onDayClick={openByDay} />
          <Link
            href="/orders"
            className="mt-3 flex items-center justify-center text-[11px] font-semibold pt-2.5 transition-opacity hover:opacity-70"
            style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
          >
            עמוד הזמנות ←
          </Link>
        </section>

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
    </>
  );
}

// ── Finance analytics types ───────────────────────────────────────────────────

interface FinKpi { total: number; count: number }

interface FinOrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  orderStatus: string;
  date: string | null;
  paymentMethod: string | null;
}

interface FinanceOverviewData {
  kpis: {
    today:  FinKpi;
    week:   FinKpi;
    month:  FinKpi;
    year:   FinKpi;
    unpaid: FinKpi;
  };
  dailyChart:      Array<{ key: string; label: string; amount: number }>;
  monthlyChart:    Array<{ key: string; label: string; amount: number }>;
  byPaymentMethod: Array<{ method: string; count: number; amount: number }>;
  topCustomers:    Array<{ id: string; name: string; amount: number; count: number }>;
  highValueOrders: FinOrderRow[];
  recentPaid:      FinOrderRow[];
  openOrders:      FinOrderRow[];
}

// ── Finance sub-components ────────────────────────────────────────────────────

function FinKpiCard({
  label, amount, count, countLabel, accent, accentBg, onClick,
}: {
  label: string;
  amount: number;
  count: number;
  countLabel?: string;
  accent: string;
  accentBg: string;
  onClick?: () => void;
}) {
  const base = (
    <>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>{label}</p>
      <p className="text-[20px] font-bold tabular-nums leading-none" style={{ color: amount > 0 ? accent : C.textMuted }}>
        {formatCurrency(amount)}
      </p>
      {count > 0 && (
        <p className="text-[9.5px] font-medium" style={{ color: C.textMuted }}>
          <span
            className="inline-block px-1.5 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: accentBg, color: accent }}
          >
            {count}
          </span>
          {' '}{countLabel ?? 'הזמנות'}
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl p-3 flex flex-col gap-1 w-full text-right transition-all hover:shadow-md hover:opacity-90"
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 8px rgba(47,27,20,0.04)',
          cursor: 'pointer',
        }}
      >
        {base}
      </button>
    );
  }
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-1"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
    >
      {base}
    </div>
  );
}

function FinBarChart({
  bars,
  currentKey,
  height = 52,
  onBarClick,
}: {
  bars: Array<{ key: string; label: string; amount: number }>;
  currentKey: string;
  height?: number;
  onBarClick?: (key: string, label: string) => void;
}) {
  const max = Math.max(...bars.map(b => b.amount), 1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-px" style={{ height }}>
        {bars.map(({ key, label, amount }) => {
          const h = amount > 0 ? Math.max((amount / max) * (height - 4), 3) : 1;
          const isCurrent = key === currentKey;
          const barStyle = {
            height: `${h}px`,
            backgroundColor: isCurrent ? C.brand : amount > 0 ? C.gold : C.borderSoft,
            opacity: amount > 0 ? 1 : 0.35,
          };
          return onBarClick && amount > 0 ? (
            <button
              key={key}
              type="button"
              onClick={() => onBarClick(key, label)}
              className="flex-1 rounded-t-sm transition-all hover:opacity-70"
              style={{ ...barStyle, cursor: 'pointer' }}
              title={`${label}: ${formatCurrency(amount)}`}
            />
          ) : (
            <div
              key={key}
              className="flex-1 rounded-t-sm transition-all"
              style={barStyle}
              title={amount > 0 ? `${label}: ${formatCurrency(amount)}` : undefined}
            />
          );
        })}
      </div>
      <div className="flex items-start">
        {bars.map(({ key, label }, i) => {
          const n = bars.length;
          const show = n <= 14 || i === 0 || i === Math.floor(n / 3) || i === Math.floor(2 * n / 3) || i === n - 1;
          return (
            <div key={key} className="flex-1 text-center overflow-hidden">
              {show && (
                <span className="text-[7px] font-medium leading-none" style={{ color: C.textMuted }}>
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinOrderList({
  orders,
  onNavigate,
  bg,
  amountColor,
  showStatus,
  emptyText,
}: {
  orders: FinOrderRow[];
  onNavigate: (path: string) => void;
  bg?: string;
  amountColor?: string;
  showStatus?: boolean;
  emptyText: string;
}) {
  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-5 rounded-lg" style={{ backgroundColor: C.borderSoft }}>
        <span className="text-[11px]" style={{ color: C.textMuted }}>{emptyText}</span>
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {orders.map(o => (
        <li key={o.id}>
          <button
            onClick={() => onNavigate(`/orders/${o.id}`)}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-right transition-opacity hover:opacity-75"
            style={{ backgroundColor: bg ?? C.brandSoft, border: `1px solid ${C.border}` }}
          >
            <span className="font-mono text-[9.5px] flex-shrink-0 w-14 truncate" style={{ color: C.textMuted }}>
              {o.orderNumber}
            </span>
            <span className="text-[11px] truncate flex-1" style={{ color: C.text }}>
              {o.customerName}
            </span>
            {o.date && (
              <span className="text-[9.5px] flex-shrink-0 tabular-nums" style={{ color: C.textMuted }}>
                {o.date.slice(5).replace('-', '/')}
              </span>
            )}
            {showStatus && o.orderStatus && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0"
                style={{ backgroundColor: C.amberSoft, color: C.amber }}
              >
                {o.orderStatus}
              </span>
            )}
            {o.paymentMethod && !showStatus && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0"
                style={{ backgroundColor: C.card, color: C.textSoft }}
              >
                {o.paymentMethod}
              </span>
            )}
            <span className="text-[11px] font-bold tabular-nums flex-shrink-0"
              style={{ color: amountColor ?? C.green }}>{formatCurrency(o.amount)}</span>
            <span className="text-[10px] flex-shrink-0" style={{ color: C.textMuted }}>←</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Finance tab ───────────────────────────────────────────────────────────────

function FinanceTab({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [data, setData]           = useState<FinanceOverviewData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [fetchErr, setFetchErr]   = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'daily' | 'monthly'>('daily');
  const [drill, setDrill]         = useState<DrillState>(null);

  useEffect(() => {
    fetch('/api/analytics/finance/overview')
      .then(r => r.json())
      .then((json: FinanceOverviewData & { error?: string }) => {
        if (json.error) { setFetchErr(json.error); return; }
        setData(json);
      })
      .catch(() => setFetchErr('שגיאה בטעינת נתונים'))
      .finally(() => setLoading(false));
  }, []);

  // All paid order rows from the API response, deduplicated
  const allFinOrders = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const all: FinOrderRow[] = [];
    for (const o of [...data.recentPaid, ...data.highValueOrders]) {
      if (!seen.has(o.id)) { seen.add(o.id); all.push(o); }
    }
    return all;
  }, [data]);

  const todayKey = todayISO();
  const monthKey = todayKey.slice(0, 7);

  if (loading) return (
    <div className="flex justify-center py-14">
      <div className="w-5 h-5 rounded-full border-2 animate-spin"
        style={{ borderColor: C.borderSoft, borderTopColor: C.brand }} />
    </div>
  );

  if (fetchErr) return (
    <p className="text-[12px] text-center py-10" style={{ color: C.red }}>{fetchErr}</p>
  );

  if (!data) return null;

  const CARD = { backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' } as const;
  const yearTotal = data.kpis.year.total;

  // ── Drill helpers ──
  const openKpiDrill = (
    label: string,
    kpi: FinKpi,
    filterFn: (o: FinOrderRow) => boolean,
  ) => {
    const items = allFinOrders
      .filter(filterFn)
      .sort((a, b) => (b.date ?? '') > (a.date ?? '') ? 1 : -1)
      .map(finRowToDrillItem);
    setDrill({
      title: `הכנסות — ${label}`,
      subtitle: `${formatCurrency(kpi.total)} · ${kpi.count} הזמנות`,
      items,
      allHref: '/orders',
    });
  };

  const openBarDrill = (key: string, label: string) => {
    const items = allFinOrders
      .filter(o => {
        if (!o.date) return false;
        return chartMode === 'daily' ? o.date === key : o.date.slice(0, 7) === key;
      })
      .map(finRowToDrillItem);
    setDrill({
      title: `הכנסות — ${label}`,
      items,
      allHref: '/orders',
    });
  };

  const openMethodDrill = (method: string, count: number, amount: number) => {
    const items = allFinOrders
      .filter(o => (o.paymentMethod || 'לא צוין') === method)
      .map(finRowToDrillItem);
    setDrill({
      title: `אמצעי תשלום — ${method}`,
      subtitle: `${count} הזמנות · ${formatCurrency(amount)}`,
      items,
      allHref: '/orders',
    });
  };

  const openUnpaidDrill = () => {
    setDrill({
      title: 'ממתין לתשלום',
      subtitle: `${data.kpis.unpaid.count} הזמנות פתוחות · ${formatCurrency(data.kpis.unpaid.total)}`,
      items: data.openOrders.map(o => ({
        ...finRowToDrillItem(o),
        badgeBg: C.amberSoft,
        badgeColor: C.amber,
        badge: o.orderStatus || undefined,
        amountColor: C.amber,
      })),
      allHref: '/orders',
    });
  };

  const [ty, tm] = todayKey.split('-');
  const weekFrom  = (() => {
    const d = new Date(todayKey + 'T12:00:00');
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const monthFrom = `${ty}-${tm}-01`;
  const yearFrom  = `${ty}-01-01`;

  return (
    <>
      {drill && <DrillModal state={drill} onClose={() => setDrill(null)} />}
      <div className="space-y-2" dir="rtl">

        {/* ── Row 1: KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
          <FinKpiCard
            label="הכנסות היום" amount={data.kpis.today.total} count={data.kpis.today.count}
            accent={C.brand} accentBg={C.brandSoft}
            onClick={() => openKpiDrill('היום', data.kpis.today, o => o.date === todayKey)}
          />
          <FinKpiCard
            label="השבוע" amount={data.kpis.week.total} count={data.kpis.week.count}
            accent={C.brand} accentBg={C.brandSoft}
            onClick={() => openKpiDrill('השבוע', data.kpis.week, o => !!o.date && o.date >= weekFrom && o.date <= todayKey)}
          />
          <FinKpiCard
            label="החודש" amount={data.kpis.month.total} count={data.kpis.month.count}
            accent={C.gold} accentBg={C.goldSoft}
            onClick={() => openKpiDrill('החודש', data.kpis.month, o => !!o.date && o.date >= monthFrom && o.date <= todayKey)}
          />
          <FinKpiCard
            label="השנה" amount={data.kpis.year.total} count={data.kpis.year.count}
            accent={C.gold} accentBg={C.goldSoft}
            onClick={() => openKpiDrill('השנה', data.kpis.year, o => !!o.date && o.date >= yearFrom && o.date <= todayKey)}
          />
          <FinKpiCard
            label="ממתין לתשלום" amount={data.kpis.unpaid.total} count={data.kpis.unpaid.count}
            accent={C.amber} accentBg={C.amberSoft} countLabel="פתוחות"
            onClick={openUnpaidDrill}
          />
        </div>

        {/* ── Row 2: Revenue chart + collection health ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">

          {/* Revenue chart */}
          <section className="rounded-xl p-4 xl:col-span-2" style={CARD}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[12px] font-bold" style={{ color: C.textSoft }}>גרף הכנסות</h2>
              <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ backgroundColor: C.surface }}>
                {(['daily', 'monthly'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setChartMode(mode)}
                    className="text-[9.5px] font-semibold px-2.5 py-1 rounded-md transition-all"
                    style={{
                      backgroundColor: chartMode === mode ? C.card : 'transparent',
                      color: chartMode === mode ? C.text : C.textMuted,
                      boxShadow: chartMode === mode ? '0 1px 4px rgba(47,27,20,0.08)' : 'none',
                    }}
                  >
                    {mode === 'daily' ? 'יומי · 30 ימים' : 'חודשי · 12 חודשים'}
                  </button>
                ))}
              </div>
            </div>
            {(chartMode === 'daily' ? data.dailyChart : data.monthlyChart).every(b => b.amount === 0) ? (
              <p className="text-[11px] py-6 text-center" style={{ color: C.textMuted }}>אין נתונים</p>
            ) : (
              <FinBarChart
                bars={chartMode === 'daily' ? data.dailyChart : data.monthlyChart}
                currentKey={chartMode === 'daily' ? todayKey : monthKey}
                height={56}
                onBarClick={openBarDrill}
              />
            )}
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-[9px]" style={{ color: C.textMuted }}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: C.brand }} />
                {chartMode === 'daily' ? 'היום' : 'החודש הנוכחי'}
              </span>
              <span className="flex items-center gap-1.5 text-[9px]" style={{ color: C.textMuted }}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: C.gold }} />
                לחץ על עמודה לפירוט
              </span>
            </div>
          </section>

          {/* Collection health + payment methods */}
          <section className="rounded-xl p-4 flex flex-col gap-4" style={CARD}>

            {/* Paid vs open split bar */}
            <div>
              <h3 className="text-[11px] font-bold mb-2" style={{ color: C.textSoft }}>גביה — השנה</h3>
              {yearTotal > 0 || data.kpis.unpaid.total > 0 ? (() => {
                const tot = yearTotal + data.kpis.unpaid.total;
                const paidPct   = tot > 0 ? Math.round((yearTotal / tot) * 100) : 0;
                const unpaidPct = 100 - paidPct;
                return (
                  <>
                    <div className="flex w-full rounded-full overflow-hidden" style={{ height: 8 }}>
                      <div style={{ width: `${paidPct}%`, backgroundColor: C.green }} />
                      <button
                        type="button"
                        onClick={openUnpaidDrill}
                        className="transition-opacity hover:opacity-70"
                        style={{ width: `${unpaidPct}%`, backgroundColor: C.amber, cursor: 'pointer' }}
                        title="לחץ לראות חובות פתוחים"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="flex items-center gap-1 text-[9px]" style={{ color: C.textMuted }}>
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: C.green }} />
                        שולם {paidPct}%
                      </span>
                      <button
                        type="button"
                        onClick={openUnpaidDrill}
                        className="flex items-center gap-1 text-[9px] transition-opacity hover:opacity-70"
                        style={{ color: C.amber, cursor: 'pointer' }}
                      >
                        פתוח {unpaidPct}%
                        <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: C.amber }} />
                      </button>
                    </div>
                  </>
                );
              })() : (
                <p className="text-[10px]" style={{ color: C.textMuted }}>אין נתונים</p>
              )}
            </div>

            {/* Payment methods mini */}
            <div style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: '0.875rem' }}>
              <h3 className="text-[11px] font-bold mb-2" style={{ color: C.textSoft }}>אמצעי תשלום · 30 ימים</h3>
              {data.byPaymentMethod.length === 0 ? (
                <p className="text-[10px]" style={{ color: C.textMuted }}>אין נתונים</p>
              ) : (() => {
                const total30 = data.byPaymentMethod.reduce((s, m) => s + m.amount, 0);
                return (
                  <div className="space-y-2">
                    {data.byPaymentMethod.slice(0, 5).map(({ method, count, amount }) => {
                      const pct = total30 > 0 ? Math.round((amount / total30) * 100) : 0;
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => openMethodDrill(method, count, amount)}
                          className="w-full text-right transition-opacity hover:opacity-70 block"
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px] truncate flex-1" style={{ color: C.textSoft }}>{method}</span>
                            <span className="text-[8.5px] px-1 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: C.brandSoft, color: C.brand }}>{count}</span>
                            <span className="text-[9.5px] font-semibold tabular-nums flex-shrink-0 w-7 text-left"
                              style={{ color: C.text }}>{pct}%</span>
                          </div>
                          <div className="w-full rounded-full overflow-hidden" style={{ height: 3, backgroundColor: C.borderSoft }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.gold }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </section>
        </div>

        {/* ── Row 3: Top customers + High-value orders ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">

          {/* Top customers */}
          <section className="rounded-xl p-4" style={CARD}>
            <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>לקוחות מובילים · 12 חודשים</h2>
            {data.topCustomers.length === 0 ? (
              <p className="text-[11px]" style={{ color: C.textMuted }}>אין נתונים</p>
            ) : (() => {
              const maxAmt = data.topCustomers[0]?.amount ?? 1;
              return (
                <ul className="space-y-1.5">
                  {data.topCustomers.map((c, i) => {
                    const barPct = maxAmt > 0 ? Math.round((c.amount / maxAmt) * 100) : 0;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => onNavigate(`/customers/${c.id}`)}
                          className="w-full flex flex-col gap-1 rounded-lg px-2.5 py-2 text-right transition-opacity hover:opacity-75"
                          style={{ backgroundColor: C.brandSoft, border: `1px solid ${C.border}` }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[9.5px] font-bold w-4 text-center flex-shrink-0 rounded"
                              style={{ color: i < 3 ? C.brand : C.textMuted, backgroundColor: i < 3 ? C.card : 'transparent' }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-[11px] font-medium truncate flex-1" style={{ color: C.text }}>{c.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: C.card, color: C.textSoft }}>{c.count} הז׳</span>
                            <span className="text-[11px] font-bold tabular-nums flex-shrink-0"
                              style={{ color: C.brand }}>{formatCurrency(c.amount)}</span>
                          </div>
                          <div className="w-full rounded-full overflow-hidden" style={{ height: 2.5, backgroundColor: C.borderSoft }}>
                            <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: C.brand, opacity: 0.4 }} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </section>

          {/* High-value paid orders */}
          <section className="rounded-xl p-4" style={CARD}>
            <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>הזמנות גבוהות · 12 חודשים</h2>
            <FinOrderList
              orders={data.highValueOrders}
              onNavigate={onNavigate}
              bg={C.goldSoft}
              amountColor={C.amber}
              emptyText="אין הזמנות"
            />
          </section>
        </div>

        {/* ── Row 4: Recently paid + Open for collection ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">

          {/* Recently paid */}
          <section className="rounded-xl p-4" style={CARD}>
            <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>שולמו לאחרונה</h2>
            <FinOrderList
              orders={data.recentPaid}
              onNavigate={onNavigate}
              bg={C.greenSoft}
              amountColor={C.green}
              emptyText="אין הזמנות ששולמו"
            />
          </section>

          {/* Open for collection */}
          <section className="rounded-xl p-4" style={CARD}>
            <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>פתוחות לגבייה</h2>
            <FinOrderList
              orders={data.openOrders}
              onNavigate={onNavigate}
              bg={C.amberSoft}
              amountColor={C.amber}
              showStatus
              emptyText="אין חובות פתוחים"
            />
          </section>
        </div>

      </div>
    </>
  );
}

// ── Deliveries tab ────────────────────────────────────────────────────────────

function DeliveriesTab({
  todayDeliveries,
  onNavigate,
}: {
  todayDeliveries: Delivery[];
  onNavigate: (path: string) => void;
}) {
  const [drill, setDrill] = useState<DrillState>(null);

  const delivered = todayDeliveries.filter(d => d.סטטוס_משלוח === 'נמסר').length;
  const collected = todayDeliveries.filter(d => d.סטטוס_משלוח === 'נאסף').length;
  const pending   = todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר' && d.סטטוס_משלוח !== 'נאסף').length;
  const total     = todayDeliveries.length;
  const progress  = total > 0 ? Math.round((delivered / total) * 100) : 0;

  const cityBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר')) {
      const city = (d.עיר || '').trim() || 'לא צוינה';
      map.set(city, (map.get(city) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [todayDeliveries]);

  const maxCity = Math.max(...cityBreakdown.map(([, c]) => c), 1);

  const activeDeliveries = todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר');

  const openStatusDrill = (
    filterKey: 'נמסרו' | 'נאספו' | 'ממתינים',
    label: string,
    count: number,
  ) => {
    if (count === 0) return;
    const filtered = todayDeliveries.filter(d => {
      if (filterKey === 'נמסרו')   return d.סטטוס_משלוח === 'נמסר';
      if (filterKey === 'נאספו')   return d.סטטוס_משלוח === 'נאסף';
      return d.סטטוס_משלוח !== 'נמסר' && d.סטטוס_משלוח !== 'נאסף';
    });
    setDrill({
      title: `משלוחים — ${label}`,
      subtitle: `${filtered.length} משלוחים`,
      items: filtered.map(deliveryToDrillItem),
      allHref: '/deliveries',
      allLabel: 'לעמוד המשלוחים',
    });
  };

  const statusRows: Array<{
    filterKey: 'נמסרו' | 'נאספו' | 'ממתינים';
    label: string;
    count: number;
    color: string;
    bg: string;
  }> = [
    { filterKey: 'נמסרו',   label: 'נמסרו',   count: delivered, color: C.green, bg: C.greenSoft },
    { filterKey: 'נאספו',   label: 'נאספו',   count: collected, color: C.amber, bg: C.amberSoft },
    { filterKey: 'ממתינים', label: 'ממתינים', count: pending,   color: C.blue,  bg: C.blueSoft  },
  ];

  return (
    <>
      {drill && <DrillModal state={drill} onClose={() => setDrill(null)} />}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
        {/* Status summary + progress */}
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>סטטוס משלוחים היום</h2>
          <div className="space-y-2 mb-3">
            {statusRows.map(({ filterKey, label, count, color, bg }) => (
              <button
                key={label}
                type="button"
                onClick={() => openStatusDrill(filterKey, label, count)}
                disabled={count === 0}
                className="flex items-center justify-between w-full rounded-lg px-2 py-1 transition-opacity hover:opacity-75"
                style={{ cursor: count > 0 ? 'pointer' : 'default' }}
              >
                <span className="text-[11.5px]" style={{ color: C.textSoft }}>{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                    style={{ backgroundColor: bg, color }}>{count}</span>
                  {count > 0 && <span className="text-[10px]" style={{ color: C.textMuted }}>←</span>}
                </div>
              </button>
            ))}
          </div>
          {total > 0 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold" style={{ color: C.textMuted }}>התקדמות</span>
                <span className="text-[10px] font-bold" style={{ color: C.green }}>{progress}%</span>
              </div>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 6, backgroundColor: C.borderSoft }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: C.green }} />
              </div>
            </>
          )}
          <button
            onClick={() => onNavigate('/deliveries')}
            className="mt-3 flex items-center justify-center w-full text-[11px] font-semibold pt-2.5 transition-opacity hover:opacity-70"
            style={{ color: C.blue, borderTop: `1px solid ${C.borderSoft}` }}
          >
            עמוד משלוחים ←
          </button>
        </section>

        {/* City breakdown */}
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>פילוח לפי עיר</h2>
          {cityBreakdown.length === 0 ? (
            <p className="text-[11px]" style={{ color: C.textMuted }}>אין משלוחים פעילים</p>
          ) : (
            <div className="space-y-2">
              {cityBreakdown.slice(0, 8).map(([city, count]) => (
                <div key={city}>
                  <div className="flex items-center justify-between mb-0.5">
                    <button
                      onClick={() => onNavigate(`/deliveries?city=${encodeURIComponent(city)}`)}
                      className="text-[11.5px] font-semibold truncate hover:underline"
                      style={{ color: C.blue }}
                    >
                      {city}
                    </button>
                    <span className="text-[11px] font-bold tabular-nums flex-shrink-0 mr-2" style={{ color: C.text }}>{count}</span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 4, backgroundColor: C.borderSoft }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / maxCity) * 100}%`, backgroundColor: C.blue, opacity: 0.25 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Active deliveries list */}
        <section
          className="rounded-xl p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
        >
          <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>משלוחים פעילים</h2>
          {activeDeliveries.length === 0 ? (
            <div className="flex items-center justify-center py-6 rounded-lg" style={{ backgroundColor: C.greenSoft }}>
              <span className="text-[12px] font-semibold" style={{ color: C.green }}>כל המשלוחים נמסרו</span>
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-52 overflow-y-auto">
              {activeDeliveries.map(d => {
                const o = d.הזמנות;
                const name = o?.לקוחות
                  ? `${o.לקוחות.שם_פרטי} ${o.לקוחות.שם_משפחה}`
                  : (o?.שם_מקבל || '—');
                const isReal = !d._noRecord && !d.id.startsWith('no-record-');
                const href = isReal ? `/deliveries?highlight=${encodeURIComponent(d.id)}` : '/deliveries';
                return (
                  <li key={d.id}>
                    <Link
                      href={href}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:opacity-80"
                      style={{ backgroundColor: C.blueSoft, border: `1px solid ${C.border}` }}
                    >
                      <span className="text-[11.5px] font-medium truncate flex-1" style={{ color: C.text }}>{name}</span>
                      {d.עיר && <span className="text-[10.5px] flex-shrink-0" style={{ color: C.textSoft }}>{d.עיר}</span>}
                      <span className="text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>←</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AnalyticsTabs({
  liveOrders,
  todayDeliveries,
  urgentItems,
  onNavigate,
}: {
  liveOrders: TodayOrder[];
  todayDeliveries: Delivery[];
  urgentItems: QueueItem[];
  onNavigate: (path: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('orders');

  return (
    <div>
      <div
        className="flex items-center gap-1 mb-2 p-1 rounded-xl"
        style={{ backgroundColor: C.surface }}
        dir="rtl"
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 text-[12px] font-semibold py-1.5 rounded-lg transition-all"
            style={{
              backgroundColor: activeTab === tab.id ? C.card : 'transparent',
              color: activeTab === tab.id ? C.text : C.textMuted,
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(47,27,20,0.08)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'orders' && (
        <OrdersTab liveOrders={liveOrders} urgentItems={urgentItems} onNavigate={onNavigate} />
      )}
      {activeTab === 'finance' && (
        <FinanceTab onNavigate={onNavigate} />
      )}
      {activeTab === 'deliveries' && (
        <DeliveriesTab todayDeliveries={todayDeliveries} onNavigate={onNavigate} />
      )}
    </div>
  );
}
