'use client';

// Right-side panel (RTL = visually on the left edge of the page) — three
// stacked sub-cards: today's status, alerts, quick actions. Shared across
// all 6 tabs so the user always has the same orientation rail visible.

import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import type { DashboardData, Severity } from './types';

interface SidePanelProps extends DashboardData {
  onJumpUnpaid: () => void;
  onJumpDeliveries: () => void;
  onJumpInventory: () => void;
  onJumpUrgent: () => void;
}

const SEV_TONE: Record<Severity, { bar: string; chip: string; chipText: string }> = {
  red:   { bar: '#C75F4D', chip: '#FEE4E2', chipText: '#991B1B' },
  amber: { bar: '#D9A655', chip: '#FBF1DC', chipText: '#92602A' },
  blue:  { bar: '#5B8FB8', chip: '#DBEAFE', chipText: '#1E40AF' },
  green: { bar: '#0F766E', chip: '#DCFAE6', chipText: '#065F46' },
};

export function DashboardSidePanel({
  stats, liveOrders, todayDeliveries, stockTotal, stock, expectedRevenue,
  onJumpUnpaid, onJumpDeliveries, onJumpInventory, onJumpUrgent,
}: SidePanelProps) {
  const urgent = liveOrders.filter(o => o.הזמנה_דחופה).length;
  const unpaidCount = stats?.unpaidOrders ?? 0;
  const unpaidAmount = stats?.unpaidAmount ?? 0;
  const pendingDelivery = todayDeliveries.filter(d => d.סטטוס_משלוח === 'ממתין').length;
  const inTransit = todayDeliveries.filter(d => d.סטטוס_משלוח === 'נאסף').length;
  const criticalStock = stock.raw.filter(r => r.status === 'אזל מהמלאי' || r.status === 'קריטי').length
                      + stock.products.filter(r => r.status === 'אזל מהמלאי' || r.status === 'קריטי').length
                      + stock.petitFours.filter(r => r.status === 'אזל מהמלאי' || r.status === 'קריטי').length;

  type Alert = { key: string; severity: Severity; title: string; sub: string; onClick: () => void; cta: string };
  const alerts: Alert[] = [];
  if (urgent > 0)         alerts.push({ key: 'urgent',    severity: 'red',   title: `${urgent} הזמנות דחופות`,    sub: 'מסומנות לטיפול מיידי',          onClick: onJumpUrgent,      cta: 'הצג' });
  if (unpaidCount > 0)    alerts.push({ key: 'unpaid',    severity: 'amber', title: `${unpaidCount} ממתינות לתשלום`, sub: `סך פתוח ${formatCurrency(unpaidAmount)}`, onClick: onJumpUnpaid,      cta: 'גבה' });
  if (criticalStock > 0)  alerts.push({ key: 'stock',     severity: 'red',   title: `${criticalStock} פריטי מלאי קריטיים`, sub: 'לבדוק לפני המשך הכנה',  onClick: onJumpInventory,   cta: 'בדוק' });
  if (pendingDelivery > 0) alerts.push({ key: 'pending',  severity: 'amber', title: `${pendingDelivery} משלוחים ממתינים`, sub: 'טרם נאספו על ידי שליח',  onClick: onJumpDeliveries,  cta: 'שלח' });
  if (inTransit > 0)      alerts.push({ key: 'transit',   severity: 'blue',  title: `${inTransit} משלוחים בדרך`,    sub: 'ממתינים לאישור מסירה',          onClick: onJumpDeliveries,  cta: 'מעקב' });

  return (
    <aside className="space-y-4">

      {/* ── מצב היום ─────────────────────────────────────────────────── */}
      <SubCard title="מצב היום">
        <ul className="space-y-2.5">
          <StatRow label="הזמנות פעילות"  value={String(liveOrders.length)} />
          <StatRow label="משלוחים היום"   value={String(todayDeliveries.length)} sub={`${stats?.deliveriesDelivered ?? 0} נמסרו · ${stats?.deliveriesCollected ?? 0} נאספו`} />
          <StatRow label="ממתין לתשלום"   value={formatCurrency(unpaidAmount)} accent={unpaidCount > 0 ? '#92602A' : undefined} />
          <StatRow label="הכנסה צפויה"     value={formatCurrency(expectedRevenue)} accent="#0F766E" />
          <StatRow label="מלאי דורש טיפול" value={String(stockTotal)} accent={stockTotal > 0 ? '#991B1B' : undefined} />
        </ul>
      </SubCard>

      {/* ── התראות ──────────────────────────────────────────────────── */}
      <SubCard title="התראות" count={alerts.length}>
        {alerts.length === 0 ? (
          <p className="text-[11.5px] py-1 text-center" style={{ color: '#8A735F' }}>
            הכל בשליטה — אין התראות פעילות.
          </p>
        ) : (
          <ul className="-mx-3 -my-1">
            {alerts.map((a, idx) => {
              const tone = SEV_TONE[a.severity];
              const isLast = idx === alerts.length - 1;
              return (
                <li
                  key={a.key}
                  className="flex items-stretch transition-colors hover:bg-amber-50/40"
                  style={{ borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
                >
                  <div style={{ width: 3, backgroundColor: tone.bar }} aria-hidden />
                  <div className="flex-1 px-3 py-2.5 flex items-center gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold truncate" style={{ color: '#2B1A10' }}>{a.title}</p>
                      <p className="text-[10.5px] mt-0.5 truncate" style={{ color: '#8A735F' }}>{a.sub}</p>
                    </div>
                    <button
                      onClick={a.onClick}
                      className="inline-flex items-center text-[11px] font-semibold px-2.5 h-7 rounded-md transition-colors flex-shrink-0"
                      style={{ backgroundColor: tone.chip, color: tone.chipText }}
                    >
                      {a.cta}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SubCard>

      {/* ── פעולות מהירות ──────────────────────────────────────────── */}
      <SubCard title="פעולות מהירות">
        <div className="grid grid-cols-1 gap-1.5">
          <QuickLink href="/orders/new"        label="+ הזמנה חדשה" />
          <QuickLink href="/customers/new"     label="+ לקוח חדש" />
          <QuickLink href="/orders"            label="כל ההזמנות" />
          <QuickLink href="/deliveries"        label="ניהול משלוחים" />
          <QuickLink href="/inventory"         label="ניהול מלאי" />
          <QuickLink href="/invoices"          label="מסמכים פיננסיים" />
        </div>
      </SubCard>

    </aside>
  );
}

function SubCard({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E8DED2',
        boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
      }}
    >
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-[12.5px] font-bold tracking-tight" style={{ color: '#2B1A10' }}>{title}</h3>
        {typeof count === 'number' && count > 0 && (
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: '#FEE4E2', color: '#991B1B' }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-[12px]" style={{ color: '#8A735F' }}>{label}</span>
      <div className="text-end">
        <span className="text-[13.5px] font-bold tabular-nums" style={{ color: accent ?? '#2B1A10' }}>{value}</span>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: '#B5A593' }}>{sub}</p>}
      </div>
    </li>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
      style={{ backgroundColor: '#FAF7F0', color: '#2B1A10' }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F4E8D8'; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FAF7F0'; }}
    >
      <span>{label}</span>
      <span style={{ color: '#8A735F' }}>←</span>
    </Link>
  );
}
