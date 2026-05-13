'use client';

// "הכל יחד" — a single combined worklist of items that need owner attention
// across order/payment/delivery/stock surfaces. Designed to answer the
// question "מה אני צריכה לבצע עכשיו?" without forcing the user to scan
// multiple cards. Maxed at ~12 rows so the panel stays scannable.

import { formatCurrency } from '@/lib/utils';
import type { DashboardData, DashboardHandlers, TodayOrder, Delivery } from './types';

type RowKind = 'urgent' | 'unpaid' | 'today' | 'delivery' | 'stock';
type Row = {
  key: string;
  kind: RowKind;
  primary: string;     // headline (customer name / item name)
  secondary: string;   // sub-info (status / amount / address)
  amount?: string;
  meta?: string;       // smaller meta label (time / order #)
  cta: { label: string; onClick: () => void; tone: 'primary' | 'mark-paid' | 'send' };
};

interface Props extends DashboardData, DashboardHandlers {
  onJumpInventory: () => void;
}

const KIND_TONE: Record<RowKind, { bar: string; label: string; chipBg: string; chipText: string }> = {
  urgent:   { bar: '#C75F4D', label: 'דחוף',   chipBg: '#FEE4E2', chipText: '#991B1B' },
  unpaid:   { bar: '#D9A655', label: 'תשלום',  chipBg: '#FBF1DC', chipText: '#92602A' },
  today:    { bar: '#7A4A27', label: 'היום',   chipBg: '#F4E8D8', chipText: '#7A4A27' },
  delivery: { bar: '#5B8FB8', label: 'משלוח',  chipBg: '#DBEAFE', chipText: '#1E40AF' },
  stock:    { bar: '#A8442D', label: 'מלאי',   chipBg: '#FEE4E2', chipText: '#991B1B' },
};

export function OverviewPanel(p: Props) {
  const rows: Row[] = [];

  // Urgent orders first — they always belong at the top.
  for (const o of p.liveOrders.filter(x => x.הזמנה_דחופה).slice(0, 3)) {
    rows.push(orderRow('urgent', o, p));
  }

  // Today orders that aren't yet at "מוכנה למשלוח" or beyond.
  const todayPending = p.todayOrders.filter(o =>
    !o.הזמנה_דחופה
    && (o.סטטוס_הזמנה === 'חדשה' || o.סטטוס_הזמנה === 'בהכנה')
  );
  for (const o of todayPending.slice(0, 3)) {
    rows.push(orderRow('today', o, p));
  }

  // Unpaid orders (any active order with open balance).
  const unpaid = p.liveOrders.filter(o =>
    o.סטטוס_תשלום !== 'שולם'
    && o.סטטוס_תשלום !== 'בארטר'
    && !rows.some(r => r.key === `o-${o.id}`)
  );
  for (const o of unpaid.slice(0, 3)) {
    rows.push(orderRow('unpaid', o, p));
  }

  // Pending deliveries (status = ממתין).
  const pendingDeliveries = p.todayDeliveries.filter(d => d.סטטוס_משלוח === 'ממתין');
  for (const d of pendingDeliveries.slice(0, 2)) {
    rows.push(deliveryRow(d, p));
  }

  // Critical stock — only at אזל / קריטי levels (not "מלאי נמוך").
  const critStock = [
    ...p.stock.raw.map(r => ({ ...r, kind: 'גלם' })),
    ...p.stock.products.map(r => ({ ...r, kind: 'מוצר' })),
    ...p.stock.petitFours.map(r => ({ ...r, kind: 'פטיפור' })),
  ].filter(r => r.status === 'אזל מהמלאי' || r.status === 'קריטי');
  for (const it of critStock.slice(0, 2)) {
    rows.push({
      key: `s-${it.kind}-${it.id}`,
      kind: 'stock',
      primary: it.שם,
      secondary: `${it.kind} · ${it.status} · נותרו ${it.quantity}`,
      cta: { label: 'פתח מלאי', onClick: p.onJumpInventory, tone: 'primary' },
    });
  }

  if (rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E8DED2',
        boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
      }}
    >
      <header className="px-5 py-3.5" style={{ borderBottom: '1px solid #F0E7D8', backgroundColor: '#FFFCF7' }}>
        <h2 className="text-[15px] font-bold tracking-tight" style={{ color: '#2B1A10', letterSpacing: '-0.01em' }}>
          דורש טיפול עכשיו
        </h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: '#8A735F' }}>
          רשימה משולבת של פריטים שדורשים את תשומת הלב שלך
        </p>
      </header>

      <ul>
        {rows.map((r, idx) => {
          const tone = KIND_TONE[r.kind];
          const isLast = idx === rows.length - 1;
          return (
            <li
              key={r.key}
              className="flex items-stretch transition-colors hover:bg-amber-50/30"
              style={{ borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
            >
              <div style={{ width: 3, backgroundColor: tone.bar }} aria-hidden />
              <div className="flex-1 px-4 py-3 grid items-center gap-3" style={{ gridTemplateColumns: '64px minmax(0,1fr) auto auto' }}>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md text-center"
                  style={{ backgroundColor: tone.chipBg, color: tone.chipText, letterSpacing: '0.06em' }}
                >
                  {tone.label}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: '#2B1A10' }}>{r.primary}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#8A735F' }}>
                    {r.meta && <><span>{r.meta}</span><span className="mx-1.5">·</span></>}
                    <span>{r.secondary}</span>
                  </p>
                </div>
                <span className="text-[12.5px] tabular-nums font-semibold whitespace-nowrap" style={{ color: '#2B1A10' }}>
                  {r.amount ?? ''}
                </span>
                <CtaButton {...r.cta} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function orderRow(kind: 'urgent' | 'today' | 'unpaid', o: TodayOrder, p: Props): Row {
  const c = o.לקוחות;
  const customerName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (o.שם_מקבל || 'לקוח');
  const isDelivery = (o.סוג_אספקה ?? '') === 'משלוח';
  const isUnpaid = o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר';

  return {
    key: `o-${o.id}`,
    kind,
    primary: customerName,
    secondary: `${o.סטטוס_הזמנה} · ${isDelivery ? 'משלוח' : 'איסוף'}`,
    meta: `${o.מספר_הזמנה} · ${o.שעת_אספקה || '—'}`,
    amount: formatCurrency(o.סך_הכל_לתשלום),
    cta: kind === 'unpaid' && isUnpaid
      ? { label: 'סמני שולם', onClick: () => p.onMarkPaid(o), tone: 'mark-paid' }
      : { label: 'השלב הבא', onClick: () => p.onAdvanceOrder(o), tone: 'primary' },
  };
}

function deliveryRow(d: Delivery, p: Props): Row {
  const o = d.הזמנות;
  const c = o?.לקוחות;
  const recipient = o?.שם_מקבל || (c ? `${c.שם_פרטי} ${c.שם_משפחה}` : 'לקוח');
  const addr = [d.כתובת, d.עיר].filter(Boolean).join(', ');
  return {
    key: `d-${d.id}`,
    kind: 'delivery',
    primary: recipient,
    secondary: addr || 'אין כתובת',
    meta: o?.מספר_הזמנה ?? undefined,
    cta: { label: 'שלח לשליח', onClick: () => p.onPatchDelivery(d, 'נאסף'), tone: 'send' },
  };
}

function CtaButton({ label, onClick, tone }: Row['cta']) {
  const styles =
    tone === 'mark-paid' ? { bg: '#0F766E', color: '#FFFFFF' }
    : tone === 'send'    ? { bg: '#7A4A27', color: '#FFFFFF' }
    :                      { bg: '#7A4A27', color: '#FFFFFF' };
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center text-[11.5px] font-semibold px-3 h-8 rounded-md transition-colors whitespace-nowrap"
      style={{ backgroundColor: styles.bg, color: styles.color }}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl px-6 py-10 text-center"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2' }}
    >
      <div
        className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2"
        style={{ backgroundColor: '#DCFAE6', color: '#0F766E' }}
      >
        ✓
      </div>
      <p className="text-[14px] font-semibold" style={{ color: '#2B1A10' }}>הכל בשליטה</p>
      <p className="text-[12px] mt-1" style={{ color: '#8A735F' }}>אין פריטים שדורשים טיפול דחוף כרגע</p>
    </div>
  );
}
