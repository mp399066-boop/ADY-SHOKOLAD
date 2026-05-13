'use client';

// "תשלומים" — focused on open balances. Shows unpaid orders sorted by
// urgency (urgent flag + amount), with a one-click mark-paid that opens
// the existing MarkPaidModal upstream. Header shows the running total of
// open amount.

import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { TodayOrder } from './types';

interface Props {
  orders: TodayOrder[];                           // already filtered to liveOrders
  onMarkPaid: (o: TodayOrder) => void;
  onOpenOrder: (o: TodayOrder) => void;
}

export function PaymentsPanel({ orders, onMarkPaid, onOpenOrder }: Props) {
  const unpaid = orders
    .filter(o => o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר')
    .sort((a, b) => {
      // Urgent first, then by amount desc
      if (!!a.הזמנה_דחופה !== !!b.הזמנה_דחופה) return a.הזמנה_דחופה ? -1 : 1;
      return (b.סך_הכל_לתשלום || 0) - (a.סך_הכל_לתשלום || 0);
    });

  const totalOpen = unpaid.reduce((s, o) => s + (o.סך_הכל_לתשלום || 0), 0);
  const partialCount = unpaid.filter(o => o.סטטוס_תשלום === 'חלקי').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl px-5 py-3.5 flex items-center justify-between" style={{
        backgroundColor: '#FFFFFF', border: '1px solid #E8DED2', boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
      }}>
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>תשלומים פתוחים</h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: '#8A735F' }}>
            {unpaid.length} הזמנות{partialCount > 0 ? ` · ${partialCount} בתשלום חלקי` : ''}
          </p>
        </div>
        <div className="text-end">
          <p className="text-[10px] uppercase font-semibold" style={{ color: '#8A735F', letterSpacing: '0.08em' }}>סך פתוח</p>
          <p className="text-[20px] font-bold tabular-nums" style={{ color: '#92602A' }}>{formatCurrency(totalOpen)}</p>
        </div>
      </div>

      {/* List */}
      {unpaid.length === 0 ? (
        <div className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2' }}>
          <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: '#DCFAE6', color: '#0F766E' }}>✓</div>
          <p className="text-[14px] font-semibold" style={{ color: '#2B1A10' }}>אין תשלומים פתוחים</p>
          <p className="text-[11.5px] mt-1" style={{ color: '#8A735F' }}>כל ההזמנות הפעילות שולמו</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2', boxShadow: '0 1px 2px rgba(58,42,26,0.04)' }}>
          <ul>
            {unpaid.map((o, idx) => {
              const c = o.לקוחות;
              const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (o.שם_מקבל || 'לקוח');
              const isLast = idx === unpaid.length - 1;
              return (
                <li
                  key={o.id}
                  className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-amber-50/30 relative"
                  style={{
                    gridTemplateColumns: 'minmax(0,1fr) 90px 90px auto auto',
                    borderBottom: isLast ? 'none' : '1px solid #F0E7D8',
                  }}
                >
                  {o.הזמנה_דחופה && (
                    <div className="absolute top-0 right-0 bottom-0" style={{ width: 2, backgroundColor: '#C75F4D' }} aria-hidden />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold truncate" style={{ color: '#2B1A10' }}>{name}</span>
                      {o.הזמנה_דחופה && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#A8442D', backgroundColor: '#FEE7E2' }}>דחוף</span>
                      )}
                    </div>
                    <p className="text-[10.5px] mt-0.5 tabular-nums truncate" style={{ color: '#8A735F' }}>
                      {o.מספר_הזמנה}
                      {o.תאריך_אספקה && (<><span className="mx-1.5">·</span><span>{formatDate(o.תאריך_אספקה)}</span></>)}
                      {o.שעת_אספקה && (<><span className="mx-1.5">·</span><span>{o.שעת_אספקה}</span></>)}
                    </p>
                  </div>
                  <span
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md text-center"
                    style={{
                      backgroundColor: o.סטטוס_תשלום === 'חלקי' ? '#FEF3C7' : '#FBF1DC',
                      color:           o.סטטוס_תשלום === 'חלקי' ? '#854D0E' : '#92602A',
                    }}
                  >
                    {o.סטטוס_תשלום}
                  </span>
                  <span className="text-[13px] tabular-nums font-bold" style={{ color: '#2B1A10' }}>{formatCurrency(o.סך_הכל_לתשלום)}</span>
                  <button
                    onClick={() => onMarkPaid(o)}
                    className="text-[11px] font-semibold px-3 h-8 rounded-md text-white"
                    style={{ backgroundColor: '#0F766E' }}
                  >
                    סמני שולם
                  </button>
                  <button
                    onClick={() => onOpenOrder(o)}
                    className="text-[10.5px] font-medium hover:underline"
                    style={{ color: '#8A735F' }}
                  >
                    פתח
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="text-[11px] text-center" style={{ color: '#8A735F' }}>
        להפקה ידנית של חשבונית/קבלה — <Link href="/orders" className="hover:underline" style={{ color: '#7A4A27' }}>פתח את כרטיס ההזמנה</Link> ובחר &quot;מסמכים פיננסיים&quot;.
      </div>
    </div>
  );
}
