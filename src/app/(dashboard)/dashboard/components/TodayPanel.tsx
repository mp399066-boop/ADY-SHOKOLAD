'use client';

// "היום" — only today's work. Three small sections stacked: today's orders,
// today's deliveries, critical stock that may block today's preparation.
// Compact, scannable; no history.

import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import type { DashboardData, DashboardHandlers, TodayOrder } from './types';

interface Props extends DashboardData, DashboardHandlers {}

export function TodayPanel(p: Props) {
  // Today's pending orders (not cancelled, not draft, not completed)
  const todayPending = p.todayOrders.filter(o =>
    o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה'
  );
  const todayDeliveries = p.todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר');
  const critStock = [
    ...p.stock.raw.map(r => ({ ...r, kind: 'גלם' })),
    ...p.stock.products.map(r => ({ ...r, kind: 'מוצר' })),
    ...p.stock.petitFours.map(r => ({ ...r, kind: 'פטיפור' })),
  ].filter(r => r.status === 'אזל מהמלאי' || r.status === 'קריטי');

  return (
    <div className="space-y-4">
      <Section title="הזמנות להיום" count={todayPending.length} href="/orders?filter=today">
        {todayPending.length === 0 ? (
          <EmptyLine text="אין הזמנות פתוחות להיום" />
        ) : (
          <ul>
            {todayPending.map((o, idx) => (
              <OrderRow key={o.id} order={o} isLast={idx === todayPending.length - 1} onAdvance={p.onAdvanceOrder} onMarkPaid={p.onMarkPaid} onOpen={p.onOpenOrder} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="משלוחים להיום" count={todayDeliveries.length} href="/deliveries">
        {todayDeliveries.length === 0 ? (
          <EmptyLine text="אין משלוחים פתוחים להיום" />
        ) : (
          <ul>
            {todayDeliveries.map((d, idx) => {
              const o = d.הזמנות;
              const c = o?.לקוחות;
              const recipient = o?.שם_מקבל || (c ? `${c.שם_פרטי} ${c.שם_משפחה}` : 'לקוח');
              const addr = [d.כתובת, d.עיר].filter(Boolean).join(', ');
              const isLast = idx === todayDeliveries.length - 1;
              return (
                <li
                  key={d.id}
                  className="grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-amber-50/30"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 80px auto', borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: '#2B1A10' }}>{recipient}</p>
                    <p className="text-[10.5px] truncate" style={{ color: '#8A735F' }}>{addr || 'אין כתובת'}</p>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2 py-1 rounded-md text-center" style={{
                    backgroundColor: d.סטטוס_משלוח === 'ממתין' ? '#FBF1DC' : '#DBEAFE',
                    color:           d.סטטוס_משלוח === 'ממתין' ? '#92602A' : '#1E40AF',
                  }}>{d.סטטוס_משלוח}</span>
                  {d.סטטוס_משלוח === 'ממתין' ? (
                    <button
                      onClick={() => p.onPatchDelivery(d, 'נאסף')}
                      disabled={p.updatingId === d.id}
                      className="text-[11px] font-semibold px-3 h-8 rounded-md text-white transition-colors disabled:opacity-60"
                      style={{ backgroundColor: '#7A4A27' }}
                    >
                      שלח לשליח
                    </button>
                  ) : (
                    <button
                      onClick={() => p.onOpenDelivery(d)}
                      className="text-[11px] font-medium hover:underline"
                      style={{ color: '#8A735F' }}
                    >
                      פרטים
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="מלאי קריטי" count={critStock.length} href="/inventory">
        {critStock.length === 0 ? (
          <EmptyLine text="אין מלאי קריטי שעלול לעצור הכנה" tone="green" />
        ) : (
          <ul>
            {critStock.map((it, idx) => {
              const isLast = idx === critStock.length - 1;
              const tone = it.status === 'אזל מהמלאי'
                ? { bg: '#FEE4E2', text: '#991B1B' }
                : { bg: '#FFEFD5', text: '#92400E' };
              return (
                <li
                  key={`${it.kind}-${it.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-amber-50/30"
                  style={{ borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
                >
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#8A735F', backgroundColor: '#F0E7D8', letterSpacing: '0.04em' }}>{it.kind}</span>
                  <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: '#2B1A10' }}>{it.שם}</span>
                  <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: '#8A735F' }}>{it.quantity}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: tone.bg, color: tone.text }}>{it.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, href, children }: { title: string; count: number; href: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2', boxShadow: '0 1px 2px rgba(58,42,26,0.04)' }}
    >
      <header className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: '#FFFCF7', borderBottom: '1px solid #F0E7D8' }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-bold" style={{ color: '#2B1A10' }}>{title}</h3>
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: '#F4E8D8', color: '#7A4A27' }}>{count}</span>
        </div>
        <Link href={href} className="text-[10.5px] font-medium hover:underline" style={{ color: '#8A735F' }}>לרשימה →</Link>
      </header>
      {children}
    </div>
  );
}

function EmptyLine({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'green' }) {
  return (
    <p className="text-[11.5px] py-4 text-center" style={{ color: tone === 'green' ? '#0F766E' : '#8A735F' }}>{text}</p>
  );
}

function OrderRow({
  order, isLast, onAdvance, onMarkPaid, onOpen,
}: {
  order: TodayOrder;
  isLast: boolean;
  onAdvance: (o: TodayOrder) => void;
  onMarkPaid: (o: TodayOrder) => void;
  onOpen: (o: TodayOrder) => void;
}) {
  const c = order.לקוחות;
  const customerName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');
  const isDelivery = (order.סוג_אספקה ?? '') === 'משלוח';
  const paid = order.סטטוס_תשלום === 'שולם' || order.סטטוס_תשלום === 'בארטר';
  return (
    <li
      className="grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-amber-50/30"
      style={{ gridTemplateColumns: '52px minmax(0,1fr) 60px 80px auto auto', borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
    >
      <span className="tabular-nums text-[12px] font-semibold" style={{ color: '#2B1A10' }}>{order.שעת_אספקה || '—'}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold truncate" style={{ color: '#2B1A10' }}>{customerName}</p>
        <p className="font-mono text-[10.5px]" style={{ color: '#B89870' }}>{order.מספר_הזמנה}</p>
      </div>
      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md text-center" style={{ backgroundColor: isDelivery ? '#DBEAFE' : '#F4E8D8', color: isDelivery ? '#1E40AF' : '#7A4A27' }}>
        {isDelivery ? 'משלוח' : 'איסוף'}
      </span>
      <span className="text-[12.5px] tabular-nums font-bold" style={{ color: '#2B1A10' }}>{formatCurrency(order.סך_הכל_לתשלום)}</span>
      {!paid && (
        <button
          onClick={() => onMarkPaid(order)}
          className="text-[10.5px] font-semibold px-2 h-7 rounded-md text-white"
          style={{ backgroundColor: '#0F766E' }}
        >
          שולם
        </button>
      )}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onAdvance(order)}
          className="text-[11px] font-semibold px-3 h-8 rounded-md text-white"
          style={{ backgroundColor: '#7A4A27' }}
        >
          השלב הבא
        </button>
        <button
          onClick={() => onOpen(order)}
          className="text-[10.5px] font-medium hover:underline"
          style={{ color: '#8A735F' }}
        >
          פתח
        </button>
      </div>
    </li>
  );
}
