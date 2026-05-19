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

// ── 7-day delivery schedule bars ──────────────────────────────────────────────

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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
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
  );
}

// ── Finance analytics types ───────────────────────────────────────────────────

type FinanceRange = 'today' | 'week' | 'month' | '30days';

interface FinanceData {
  range: FinanceRange;
  dateFrom: string;
  dateTo: string;
  paid: { total: number; count: number };
  unpaid: { total: number; count: number };
  dailyRevenue: Array<{ date: string; amount: number }>;
  byPaymentMethod: Array<{ method: string; count: number; amount: number }>;
  topCustomers: Array<{ id: string; name: string; amount: number; count: number }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    amount: number;
    orderStatus: string;
    date: string | null;
    paymentMethod: string | null;
  }>;
}

const FINANCE_RANGES: Array<{ key: FinanceRange; label: string }> = [
  { key: 'today',  label: 'היום'            },
  { key: 'week',   label: 'השבוע'           },
  { key: 'month',  label: 'החודש'           },
  { key: '30days', label: '30 ימים אחרונים' },
];

// ── Revenue bar chart ─────────────────────────────────────────────────────────

function RevenueBarChart({
  days,
  dateFrom,
  dateTo,
}: {
  days: Array<{ date: string; amount: number }>;
  dateFrom: string;
  dateTo: string;
}) {
  const maxAmount = Math.max(...days.map(d => d.amount), 1);
  const today = todayISO();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-px" style={{ height: 44 }}>
        {days.map(({ date, amount }) => {
          const h = amount > 0 ? Math.max((amount / maxAmount) * 40, 3) : 1;
          const isToday = date === today;
          const inRange = date >= dateFrom && date <= dateTo;
          return (
            <div
              key={date}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${h}px`,
                backgroundColor: isToday ? C.brand : inRange ? C.gold : C.borderSoft,
                opacity: amount > 0 ? 1 : 0.4,
              }}
              title={amount > 0 ? `${date.slice(5).replace('-', '/')}: ${formatCurrency(amount)}` : undefined}
            />
          );
        })}
      </div>
      <div className="flex items-start">
        {days.map(({ date }, i) => {
          const show = i === 0 || i === 7 || i === 14 || i === 21 || i === 29;
          return (
            <div key={date} className="flex-1 text-center overflow-hidden">
              {show && (
                <span className="text-[7.5px] font-medium leading-none" style={{ color: C.textMuted }}>
                  {date.slice(5).replace('-', '/')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Finance tab ───────────────────────────────────────────────────────────────

function FinanceTab({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [range, setRange]       = useState<FinanceRange>('today');
  const [data, setData]         = useState<FinanceData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setFetchErr(null);
    fetch(`/api/analytics/finance?range=${range}`)
      .then(r => r.json())
      .then((json: FinanceData & { error?: string }) => {
        if (json.error) { setFetchErr(json.error); return; }
        setData(json);
      })
      .catch(() => setFetchErr('שגיאה בטעינת נתונים'))
      .finally(() => setLoading(false));
  }, [range]);

  const CARD = { backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' } as const;
  const rangeLabel = FINANCE_RANGES.find(r => r.key === range)?.label ?? '';

  return (
    <div className="space-y-2">

      {/* ── Range selector ── */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl"
        style={{ backgroundColor: C.surface }}
        dir="rtl"
      >
        {FINANCE_RANGES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-all"
            style={{
              backgroundColor: range === key ? C.card : 'transparent',
              color: range === key ? C.text : C.textMuted,
              boxShadow: range === key ? '0 1px 4px rgba(47,27,20,0.08)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: C.borderSoft, borderTopColor: C.brand }} />
        </div>
      ) : fetchErr ? (
        <p className="text-[12px] text-center py-8" style={{ color: C.red }}>{fetchErr}</p>
      ) : data ? (
        <>
          {/* ── Row 1: Summary + Chart + Top customers ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">

            {/* Revenue + unpaid summary */}
            <section className="rounded-xl p-4 flex flex-col gap-4" style={CARD}>
              <div>
                <p className="text-[10.5px] font-semibold mb-1" style={{ color: C.textMuted }}>
                  הכנסות · {rangeLabel}
                </p>
                <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: C.green }}>
                  {formatCurrency(data.paid.total)}
                </p>
                <p className="text-[10.5px] mt-1" style={{ color: C.textSoft }}>
                  {data.paid.count} הזמנות ששולמו
                </p>
              </div>
              <div style={{ borderTop: `1px solid ${C.borderSoft}`, paddingTop: '0.875rem' }}>
                <p className="text-[10.5px] font-semibold mb-1" style={{ color: C.textMuted }}>חוב פתוח (כולל)</p>
                <p className="text-[22px] font-bold tabular-nums leading-none"
                  style={{ color: data.unpaid.count > 0 ? C.amber : C.textMuted }}>
                  {formatCurrency(data.unpaid.total)}
                </p>
                {data.unpaid.count > 0 && (
                  <p className="text-[10.5px] mt-1" style={{ color: C.textSoft }}>
                    {data.unpaid.count} הזמנות ממתינות לתשלום
                  </p>
                )}
              </div>
            </section>

            {/* Daily revenue chart (always 30-day window) */}
            <section className="rounded-xl p-4" style={CARD}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[12px] font-bold" style={{ color: C.textSoft }}>הכנסות יומיות — 30 ימים</h2>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: C.goldSoft, color: C.amber }}>
                  {formatCurrency(data.dailyRevenue.reduce((s, d) => s + d.amount, 0))}
                </span>
              </div>
              {data.dailyRevenue.every(d => d.amount === 0) ? (
                <p className="text-[11px] py-4 text-center" style={{ color: C.textMuted }}>אין נתונים</p>
              ) : (
                <RevenueBarChart days={data.dailyRevenue} dateFrom={data.dateFrom} dateTo={data.dateTo} />
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-[9.5px]" style={{ color: C.textMuted }}>
                  <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: C.brand }} />
                  היום
                </span>
                <span className="flex items-center gap-1 text-[9.5px]" style={{ color: C.textMuted }}>
                  <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: C.gold }} />
                  בטווח הנבחר
                </span>
              </div>
            </section>

            {/* Top customers */}
            <section className="rounded-xl p-4" style={CARD}>
              <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>
                לקוחות מובילים · {rangeLabel}
              </h2>
              {data.topCustomers.length === 0 ? (
                <p className="text-[11px]" style={{ color: C.textMuted }}>אין נתונים</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.topCustomers.slice(0, 6).map(c => (
                    <li key={c.id}>
                      <button
                        onClick={() => onNavigate(`/customers/${c.id}`)}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-right transition-colors hover:opacity-80"
                        style={{ backgroundColor: C.brandSoft, border: `1px solid ${C.border}` }}
                      >
                        <span className="text-[11.5px] font-medium truncate flex-1" style={{ color: C.text }}>
                          {c.name}
                        </span>
                        <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: C.card, color: C.textSoft }}>
                          {c.count} הז׳
                        </span>
                        <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0"
                          style={{ color: C.brand }}>
                          {formatCurrency(c.amount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── Row 2: Payment methods + Paid orders list ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">

            {/* Payment method breakdown */}
            <section className="rounded-xl p-4" style={CARD}>
              <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>
                אמצעי תשלום · {rangeLabel}
              </h2>
              {data.byPaymentMethod.length === 0 ? (
                <p className="text-[11px]" style={{ color: C.textMuted }}>אין נתונים</p>
              ) : (
                <div className="space-y-2.5">
                  {data.byPaymentMethod.map(({ method, count, amount }) => {
                    const pct = data.paid.total > 0 ? Math.round((amount / data.paid.total) * 100) : 0;
                    return (
                      <div key={method}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11.5px] truncate flex-1" style={{ color: C.textSoft }}>{method}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: C.brandSoft, color: C.brand }}>
                            {count} הז׳
                          </span>
                          <span className="text-[11px] font-bold tabular-nums flex-shrink-0 w-24 text-left"
                            style={{ color: C.text }}>{formatCurrency(amount)}</span>
                          <span className="text-[10px] tabular-nums flex-shrink-0 w-8 text-left"
                            style={{ color: C.textMuted }}>{pct}%</span>
                        </div>
                        <div className="w-full rounded-full overflow-hidden" style={{ height: 3, backgroundColor: C.borderSoft }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.gold }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Paid orders list */}
            <section className="rounded-xl p-4" style={CARD}>
              <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>
                הזמנות ששולמו
                {data.paid.count > data.orders.length && (
                  <span className="font-normal text-[10px] mr-1.5" style={{ color: C.textMuted }}>
                    ({data.orders.length} מוצגים מתוך {data.paid.count})
                  </span>
                )}
              </h2>
              {data.orders.length === 0 ? (
                <div className="flex items-center justify-center py-6 rounded-lg" style={{ backgroundColor: C.borderSoft }}>
                  <span className="text-[12px] font-semibold" style={{ color: C.textMuted }}>
                    אין הזמנות ששולמו בטווח זה
                  </span>
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {data.orders.map(o => (
                    <li key={o.id}>
                      <button
                        onClick={() => onNavigate(`/orders/${o.id}`)}
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-right transition-colors hover:opacity-80"
                        style={{ backgroundColor: C.greenSoft, border: `1px solid ${C.border}` }}
                      >
                        <span className="font-mono text-[10px] flex-shrink-0" style={{ color: C.textMuted }}>
                          {o.orderNumber}
                        </span>
                        <span className="text-[11.5px] truncate flex-1" style={{ color: C.text }}>
                          {o.customerName}
                        </span>
                        {o.date && (
                          <span className="text-[10.5px] flex-shrink-0 tabular-nums" style={{ color: C.textMuted }}>
                            {o.date.slice(5).replace('-', '/')}
                          </span>
                        )}
                        {o.paymentMethod && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                            style={{ backgroundColor: C.card, color: C.textSoft }}>
                            {o.paymentMethod}
                          </span>
                        )}
                        <span className="text-[11.5px] font-bold tabular-nums flex-shrink-0"
                          style={{ color: C.green }}>{formatCurrency(o.amount)}</span>
                        <span className="text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>←</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
      {/* Status summary + progress */}
      <section
        className="rounded-xl p-4"
        style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(47,27,20,0.04)' }}
      >
        <h2 className="text-[12px] font-bold mb-3" style={{ color: C.textSoft }}>סטטוס משלוחים היום</h2>
        <div className="space-y-2 mb-3">
          {[
            { label: 'נמסרו',   count: delivered, color: C.green, bg: C.greenSoft },
            { label: 'נאספו',   count: collected, color: C.amber, bg: C.amberSoft },
            { label: 'ממתינים', count: pending,   color: C.blue,  bg: C.blueSoft  },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11.5px]" style={{ color: C.textSoft }}>{label}</span>
              <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-md tabular-nums" style={{ backgroundColor: bg, color }}>{count}</span>
            </div>
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
