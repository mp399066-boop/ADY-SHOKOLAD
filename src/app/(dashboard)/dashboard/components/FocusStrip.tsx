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
  onJumpDeliveries: () => void;
  onJumpUnpaid: () => void;
  onJumpStock: () => void;
}

export function FocusStrip({
  ordersTodayCount, deliveriesTodayCount, unpaidAmount, unpaidCount,
  criticalStockCount, ordersTomorrow,
  onJumpDeliveries, onJumpUnpaid, onJumpStock,
}: Props) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
        overflow: 'hidden',
      }}
    >
      <Cell
        label="הזמנות להיום"
        value={String(ordersTodayCount)}
        sub={ordersTomorrow > 0 ? `${ordersTomorrow} מחר` : 'אין הזמנות מחר'}
        accent={C.brand}
      />
      <Divider />
      <Cell
        label="משלוחים היום"
        value={String(deliveriesTodayCount)}
        sub="לחצי לטיפול במשלוחים"
        accent={C.blue}
        onClick={deliveriesTodayCount > 0 ? onJumpDeliveries : undefined}
      />
      <Divider />
      <Cell
        label="ממתין לתשלום"
        value={formatCurrency(unpaidAmount)}
        sub={unpaidCount > 0 ? `${unpaidCount} הזמנות פתוחות` : 'הכל סגור'}
        accent={unpaidCount > 0 ? C.amber : C.textMuted}
        onClick={unpaidCount > 0 ? onJumpUnpaid : undefined}
      />
      <Divider />
      <Cell
        label="מלאי קריטי"
        value={String(criticalStockCount)}
        sub={criticalStockCount > 0 ? 'דורש השלמה דחופה' : 'הכל תקין'}
        accent={criticalStockCount > 0 ? C.red : C.green}
        onClick={criticalStockCount > 0 ? onJumpStock : undefined}
      />
    </div>
  );
}

function Cell({
  label, value, sub, accent, onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Tag: 'button' | 'div' = interactive ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`text-right px-5 py-4 transition-colors w-full ${interactive ? 'cursor-pointer hover:bg-[#FBF8F1]' : ''}`}
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <span className="text-[10px] uppercase font-semibold" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          {label}
        </span>
      </div>
      <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: C.text, letterSpacing: '-0.015em' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] mt-2 truncate" style={{ color: C.textSoft }}>{sub}</p>}
    </Tag>
  );
}

function Divider() {
  return <div className="hidden md:block" style={{ width: 1, backgroundColor: C.borderSoft }} />;
}
