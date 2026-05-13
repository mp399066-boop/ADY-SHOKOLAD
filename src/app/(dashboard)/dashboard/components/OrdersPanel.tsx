'use client';

// "הזמנות" — active orders only. The page.tsx already builds an
// OrdersWorkTable that does exactly this; this panel is a thin wrapper that
// receives the rendered table from props so we don't need to duplicate the
// table logic. Filters can still happen at the parent level via filter
// chips above (parent controls the data this panel receives).

import type { TodayOrder } from './types';
import Link from 'next/link';

interface Props {
  visibleCount: number;
  table: React.ReactNode;
  filterChips: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  // For an empty state — filtered or whole
  onClearFilter?: () => void;
  // unused but kept for future per-tab affordances
  _orders?: TodayOrder[];
}

export function OrdersPanel({ visibleCount, table, filterChips, empty, emptyText }: Props) {
  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>הזמנות פעילות</h2>
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: '#F4E8D8', color: '#7A4A27' }}>
            {visibleCount}
          </span>
        </div>
        <Link href="/orders?filter=today" className="text-[11px] font-medium hover:underline" style={{ color: '#8A735F' }}>פתח מסך הזמנות מלא →</Link>
      </header>
      {filterChips}
      {empty ? (
        <div className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2' }}>
          <p className="text-[14px] font-semibold" style={{ color: '#2B1A10' }}>{emptyText || 'אין הזמנות פעילות'}</p>
        </div>
      ) : table}
    </div>
  );
}
