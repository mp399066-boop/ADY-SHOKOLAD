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
import type { QueueItem } from './queue-builder';
import { Modal } from '@/components/ui/Modal';
import { DashboardInventoryAlerts } from './DashboardInventoryAlerts';
import { DashboardEmployeeTasks } from './DashboardEmployeeTasks';
import { AttentionPanel } from './AttentionPanel';
import { AnalyticsTabs } from './AnalyticsTabs';

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

// ── KPI drill-down modals ────────────────────────────────────────────────────

type ModalKind = 'revenue' | 'unpaid' | 'active' | 'deliveries' | 'urgent';

function ocname(o: TodayOrder): string {
  const c = o.לקוחות;
  return c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (o.שם_מקבל || '—');
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const ORDER_STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  'חדשה':           { bg: C.goldSoft,  color: C.gold,  label: 'חדשה'    },
  'בהכנה':          { bg: C.brandSoft, color: C.brand, label: 'בהכנה'   },
  'מוכנה למשלוח':  { bg: C.greenSoft, color: C.green, label: 'מוכנה'   },
  'נשלחה':          { bg: C.blueSoft,  color: C.blue,  label: 'נשלחה'   },
  'הושלמה בהצלחה': { bg: C.greenSoft, color: C.green, label: 'הושלמה'  },
  'בוטלה':          { bg: C.redSoft,   color: C.red,   label: 'בוטלה'   },
};

function OStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS_BADGE[status] ?? { bg: C.borderSoft, color: C.textMuted, label: status };
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function DrillRow({ href, onNavigate, onClose, children }: {
  href: string;
  onNavigate: (p: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-right transition-colors hover:opacity-80"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
      onClick={() => { onClose(); onNavigate(href); }}
    >
      {children}
      <span className="mr-auto text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>←</span>
    </button>
  );
}

function KpiDrillModal({
  kind,
  liveOrders,
  revenueOrders,
  revenueLoading,
  deliveries,
  onClose,
  onNavigate,
}: {
  kind: ModalKind;
  liveOrders: TodayOrder[];
  revenueOrders: TodayOrder[];
  revenueLoading: boolean;
  deliveries: Delivery[];
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const TITLES: Record<ModalKind, string> = {
    revenue:    'הכנסות היום',
    unpaid:     'ממתין לתשלום',
    active:     'הזמנות פעילות',
    deliveries: 'משלוחים היום',
    urgent:     'דחוף עכשיו',
  };

  const unpaidOrders = liveOrders.filter(o =>
    (o.סטטוס_תשלום === 'ממתין' || o.סטטוס_תשלום === 'חלקי') &&
    o.סטטוס_הזמנה !== 'הושלמה בהצלחה' &&
    o.סטטוס_הזמנה !== 'בוטלה' &&
    o.סטטוס_הזמנה !== 'טיוטה'
  );

  const urgentOrders = liveOrders.filter(o =>
    o.הזמנה_דחופה &&
    o.סטטוס_הזמנה !== 'הושלמה בהצלחה' &&
    o.סטטוס_הזמנה !== 'בוטלה'
  );

  let subtitle = '';
  if (kind === 'revenue') {
    const total = revenueOrders.reduce((s, o) => s + (o.סך_הכל_לתשלום ?? 0), 0);
    subtitle = `${revenueOrders.length} הזמנות · ${formatCurrency(total)}`;
  } else if (kind === 'unpaid') {
    const total = unpaidOrders.reduce((s, o) => s + (o.סך_הכל_לתשלום ?? 0), 0);
    subtitle = `${unpaidOrders.length} הזמנות · ${formatCurrency(total)}`;
  } else if (kind === 'active') {
    subtitle = `${liveOrders.length} הזמנות`;
  } else if (kind === 'deliveries') {
    subtitle = `${deliveries.length} משלוחים`;
  } else if (kind === 'urgent') {
    subtitle = `${urgentOrders.length} הזמנות דחופות`;
  }

  return (
    <Modal open onClose={onClose} title={TITLES[kind]} size="lg">
      <div dir="rtl" className="space-y-3">
        {subtitle && (
          <p className="text-[12px] font-semibold pb-1" style={{ color: C.textSoft, borderBottom: `1px solid ${C.borderSoft}` }}>
            {subtitle}
          </p>
        )}

        {/* ── Revenue ── */}
        {kind === 'revenue' && (revenueLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: C.borderSoft, borderTopColor: C.brand }} />
          </div>
        ) : revenueOrders.length === 0 ? (
          <p className="text-[13px] text-center py-6" style={{ color: C.textMuted }}>אין תשלומים להיום</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {revenueOrders.map(o => (
              <DrillRow key={o.id} href={`/orders/${o.id}`} onNavigate={onNavigate} onClose={onClose}>
                <span className="font-mono text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>{o.מספר_הזמנה}</span>
                <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: C.text }}>{ocname(o)}</span>
                {o.אופן_תשלום && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: C.greenSoft, color: C.green }}>
                    {o.אופן_תשלום}
                  </span>
                )}
                <span className="text-[13px] font-bold tabular-nums flex-shrink-0" style={{ color: C.green }}>
                  {formatCurrency(o.סך_הכל_לתשלום ?? 0)}
                </span>
              </DrillRow>
            ))}
          </div>
        ))}

        {/* ── Unpaid ── */}
        {kind === 'unpaid' && (unpaidOrders.length === 0 ? (
          <p className="text-[13px] text-center py-6" style={{ color: C.textMuted }}>אין הזמנות פתוחות לתשלום</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {unpaidOrders.map(o => (
              <DrillRow key={o.id} href={`/orders/${o.id}`} onNavigate={onNavigate} onClose={onClose}>
                <span className="font-mono text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>{o.מספר_הזמנה}</span>
                <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: C.text }}>{ocname(o)}</span>
                <OStatusBadge status={o.סטטוס_הזמנה} />
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: C.amberSoft, color: C.amber }}>
                  {o.סטטוס_תשלום}
                </span>
                <span className="text-[13px] font-bold tabular-nums flex-shrink-0" style={{ color: C.amber }}>
                  {formatCurrency(o.סך_הכל_לתשלום ?? 0)}
                </span>
              </DrillRow>
            ))}
          </div>
        ))}

        {/* ── Active orders ── */}
        {kind === 'active' && (liveOrders.length === 0 ? (
          <p className="text-[13px] text-center py-6" style={{ color: C.textMuted }}>אין הזמנות פעילות</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {liveOrders.map(o => (
              <DrillRow key={o.id} href={`/orders/${o.id}`} onNavigate={onNavigate} onClose={onClose}>
                <span className="font-mono text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>{o.מספר_הזמנה}</span>
                <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: C.text }}>{ocname(o)}</span>
                <OStatusBadge status={o.סטטוס_הזמנה} />
                {o.תאריך_אספקה && (
                  <span className="text-[11px] flex-shrink-0 tabular-nums" style={{ color: C.textMuted }}>{fmtShortDate(o.תאריך_אספקה)}</span>
                )}
              </DrillRow>
            ))}
          </div>
        ))}

        {/* ── Today deliveries ── */}
        {kind === 'deliveries' && (deliveries.length === 0 ? (
          <p className="text-[13px] text-center py-6" style={{ color: C.textMuted }}>אין משלוחים להיום</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {deliveries.map(d => {
              const o = d.הזמנות;
              const name = o?.לקוחות
                ? `${o.לקוחות.שם_פרטי} ${o.לקוחות.שם_משפחה}`
                : (o?.שם_מקבל || '—');
              const isRealDelivery = !d._noRecord && !d.id.startsWith('no-record-');
              const href = isRealDelivery ? `/deliveries?highlight=${encodeURIComponent(d.id)}` : '/deliveries';
              const stBg = d.סטטוס_משלוח === 'נמסר' ? C.greenSoft : d.סטטוס_משלוח === 'נאסף' ? C.amberSoft : C.borderSoft;
              const stColor = d.סטטוס_משלוח === 'נמסר' ? C.green : d.סטטוס_משלוח === 'נאסף' ? C.amber : C.textMuted;
              return (
                <DrillRow key={d.id} href={href} onNavigate={onNavigate} onClose={onClose}>
                  <span className="font-mono text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>{o?.מספר_הזמנה || '—'}</span>
                  <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: C.text }}>{name}</span>
                  {d.עיר && <span className="text-[11px] flex-shrink-0" style={{ color: C.textSoft }}>{d.עיר}</span>}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: stBg, color: stColor }}>
                    {d.סטטוס_משלוח}
                  </span>
                </DrillRow>
              );
            })}
          </div>
        ))}

        {/* ── Urgent ── */}
        {kind === 'urgent' && (urgentOrders.length === 0 ? (
          <p className="text-[13px] text-center py-6" style={{ color: C.textMuted }}>הכל תקין — אין הזמנות דחופות</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {urgentOrders.map(o => (
              <DrillRow key={o.id} href={`/orders/${o.id}`} onNavigate={onNavigate} onClose={onClose}>
                <span className="font-mono text-[11px] flex-shrink-0" style={{ color: C.textMuted }}>{o.מספר_הזמנה}</span>
                <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: C.text }}>{ocname(o)}</span>
                <OStatusBadge status={o.סטטוס_הזמנה} />
                {o.תאריך_אספקה && (
                  <span className="text-[11px] flex-shrink-0 tabular-nums font-semibold" style={{ color: C.red }}>{fmtShortDate(o.תאריך_אספקה)}</span>
                )}
                {o.סטטוס_תשלום !== 'שולם' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: C.amberSoft, color: C.amber }}>
                    {o.סטטוס_תשלום}
                  </span>
                )}
              </DrillRow>
            ))}
          </div>
        ))}
      </div>
    </Modal>
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
  const liveOrders = useMemo(
    () => activeOrders.filter(o =>
      o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה',
    ),
    [activeOrders],
  );

  const activeCount  = liveOrders.length;
  // stats?.urgentOrders is the authoritative server count (orders only,
  // הזמנה_דחופה=true AND status NOT IN cancelled/draft/completed). The
  // fallback path runs when /api/dashboard hasn't returned yet; without
  // .filter(type=order) it would mix in critical stock alerts and the KPI
  // could read e.g. "6 דחוף עכשיו" while the modal (which uses liveOrders,
  // orders only) shows 0. See queue-builder.ts:155 for the mixed urgency.
  const urgentCount  = stats?.urgentOrders ?? urgentItems.filter(it => it.type === 'order').length;
  const deliveryCount = stats?.deliveriesToday ?? 0;
  const unpaidAmount  = stats?.unpaidAmount ?? 0;
  const unpaidCount   = stats?.unpaidOrders ?? 0;
  const revenueToday  = stats?.revenueToday ?? 0;

  // ── Drill-down modal state ──
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [revenueOrders, setRevenueOrders] = useState<TodayOrder[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  useEffect(() => {
    if (modal !== 'revenue') return;
    setRevenueLoading(true);
    // Drilldown for "הכנסות היום". Uses the dedicated `paid-today` filter
    // mode whose WHERE clause is byte-aligned with the KPI count query in
    // src/app/api/dashboard/route.ts. NO client-side post-filter: dropping
    // it was the whole point of the dedicated filter mode (a previous
    // version fetched filter=today and then filtered to סטטוס_תשלום='שולם'
    // here, which excluded completed-and-paid orders that the count
    // included — count=N, modal=0 mismatch).
    fetch('/api/orders?filter=paid-today&limit=200')
      .then(r => r.json())
      .then(json => {
        const rows = (json.data || []) as TodayOrder[];
        // Safe drill log — card key + row count only. No PII.
        console.log('[dashboard-drill] kind: revenue | filter: paid-today | rows:', rows.length);
        setRevenueOrders(rows);
      })
      .catch(() => {})
      .finally(() => setRevenueLoading(false));
  }, [modal]);

  const deliveryCities = useMemo(() => {
    const active = todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר');
    const byCity = new Map<string, number>();
    for (const d of active) {
      const city = (d.עיר || '').trim() || 'לא צוינה';
      byCity.set(city, (byCity.get(city) || 0) + 1);
    }
    return Array.from(byCity.entries()).sort((a, b) => b[1] - a[1]);
  }, [todayDeliveries]);

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
          onClick={() => setModal('revenue')}
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
          onClick={unpaidCount > 0 ? () => setModal('unpaid') : undefined}
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
          onClick={() => setModal('active')}
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
          onClick={urgentCount > 0 ? () => setModal('urgent') : undefined}
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
          onClick={() => setModal('deliveries')}
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

      {/* ── Today delivery city breakdown ────────────────────── */}
      {deliveryCities.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-0.5">
          <span className="text-[10.5px] font-semibold" style={{ color: C.textMuted }}>אזורי משלוח פעילים:</span>
          {deliveryCities.map(([city, count]) => (
            <button
              key={city}
              // Append &date=<today-IL> so the deliveries page lands today-
              // scoped — deliveryCities is built from todayDeliveries only,
              // and without the date param the target page defaulted to ALL
              // dates which exaggerated the count vs the pill.
              onClick={() => onNavigate(`/deliveries?city=${encodeURIComponent(city)}&date=${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })}`)}
              className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-full transition-all hover:-translate-y-0.5 cursor-pointer"
              style={{ backgroundColor: C.blueSoft, color: C.blue }}
            >
              {city}
              <span className="font-bold tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Analytics tabs ────────────────────────────────────── */}
      <AnalyticsTabs
        liveOrders={liveOrders}
        todayDeliveries={todayDeliveries}
        urgentItems={urgentItems}
        onNavigate={onNavigate}
      />

      {/* ── Secondary insights — compact 4-card row ─────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 items-start">
        <CompactProductionSummary />
        <DashboardInventoryAlerts stock={stock} />
        <DashboardEmployeeTasks />
        <AttentionPanel />
      </div>

      {/* ── KPI drill-down modal ─────────────────────────────── */}
      {modal && (
        <KpiDrillModal
          kind={modal}
          liveOrders={liveOrders}
          revenueOrders={revenueOrders}
          revenueLoading={revenueLoading}
          deliveries={todayDeliveries}
          onClose={() => setModal(null)}
          onNavigate={onNavigate}
        />
      )}

    </div>
  );
}
