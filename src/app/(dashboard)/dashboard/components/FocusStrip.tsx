'use client';

// 4-KPI strip — single rounded card divided into quadrants by hairline rules
// (not 4 separate floating cards). Each cell shows label + value + a tiny
// dot accent in the value's tone. The strip is navigation, not the
// centerpiece of the dashboard.

import { formatCurrency } from '@/lib/utils';
import { C } from './theme';

interface Props {
  ordersTodayCount: number;
  deliveriesTodayCount: number;
  unpaidAmount: number;
  unpaidCount: number;
  criticalStockCount: number;
  ordersTomorrow: number;
  onJumpOrders: () => void;
  onJumpDeliveries: () => void;
  onJumpUnpaid: () => void;
  onJumpStock: () => void;
}

export function FocusStrip({
  ordersTodayCount, deliveriesTodayCount, unpaidAmount, unpaidCount,
  criticalStockCount, ordersTomorrow,
  onJumpOrders, onJumpDeliveries, onJumpUnpaid, onJumpStock,
}: Props) {
  return (
    <section
      className="rounded-xl p-2.5"
      style={{ backgroundColor: '#FFFDF9', border: `1px solid ${C.border}`, boxShadow: '0 6px 18px rgba(47,27,20,0.045)' }}
    >
      <div className="flex items-center justify-between gap-3 px-1.5 pb-2">
        <h2 className="text-[13.5px] font-bold" style={{ color: C.text }}>תמונת מצב יומית</h2>
        <span className="text-[10.5px] font-semibold" style={{ color: C.textSoft }}>לחיצה פותחת טיפול מלא</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
      <Cell
        label="הזמנות להיום"
        value={String(ordersTodayCount)}
        sub={ordersTomorrow > 0 ? `${ordersTomorrow} מחר` : 'אין הזמנות מחר'}
        accent={C.brand}
        tone="brand"
        onClick={onJumpOrders}
      />
      <Cell
        label="משלוחים היום"
        value={String(deliveriesTodayCount)}
        sub={deliveriesTodayCount > 0 ? 'דורש תיאום ומעקב' : 'אין משלוחים פעילים'}
        accent={C.blue}
        tone="blue"
        onClick={deliveriesTodayCount > 0 ? onJumpDeliveries : undefined}
      />
      <Cell
        label="ממתין לתשלום"
        value={formatCurrency(unpaidAmount)}
        sub={unpaidCount > 0 ? `${unpaidCount} הזמנות פתוחות` : 'הכל סגור'}
        accent={unpaidCount > 0 ? C.amber : C.textMuted}
        tone="amber"
        onClick={unpaidCount > 0 ? onJumpUnpaid : undefined}
      />
      <Cell
        label="מלאי קריטי"
        value={String(criticalStockCount)}
        sub={criticalStockCount > 0 ? 'דורש השלמה דחופה' : 'הכל תקין'}
        accent={criticalStockCount > 0 ? C.red : C.green}
        tone={criticalStockCount > 0 ? 'red' : 'green'}
        onClick={criticalStockCount > 0 ? onJumpStock : undefined}
      />
      </div>
    </section>
  );
}

function Cell({
  label, value, sub, accent, tone, onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  tone: 'brand' | 'blue' | 'amber' | 'red' | 'green';
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Tag: 'button' | 'div' = interactive ? 'button' : 'div';
  const glow = {
    brand: 'rgba(90,52,36,0.12)',
    blue: 'rgba(73,109,125,0.12)',
    amber: 'rgba(196,154,108,0.18)',
    red: 'rgba(157,75,74,0.13)',
    green: 'rgba(71,109,83,0.12)',
  }[tone];
  return (
    <Tag
      onClick={onClick}
      className={`relative overflow-hidden text-right px-3 py-2.5 transition-all w-full rounded-lg ${interactive ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: `1px solid ${C.borderSoft}`,
        boxShadow: 'none',
      }}
    >
      <span
        className="absolute left-0 top-0 h-full w-24"
        style={{ background: `radial-gradient(circle at 0 0, ${glow}, transparent 68%)` }}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-3 mb-2">
        <span className="text-[10.5px] font-bold" style={{ color: C.textSoft }}>
          {label}
        </span>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 0 4px ${glow}` }} />
      </div>
      <p className="relative text-[19px] font-bold tabular-nums leading-none" style={{ color: C.text, letterSpacing: '0' }}>
        {value}
      </p>
      {sub && <p className="relative text-[10.5px] mt-1.5 truncate" style={{ color: C.textSoft }}>{sub}</p>}
    </Tag>
  );
}
