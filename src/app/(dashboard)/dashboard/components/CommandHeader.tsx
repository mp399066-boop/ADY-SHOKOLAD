'use client';

// Top of the dashboard. Compact, anchored, no oversized chrome — title + a
// single meta line on the right (RTL = visually right edge); refresh + new
// order CTA on the left edge. The colour weight all sits in the espresso
// CTA — everything else is muted brown on cream.

import Link from 'next/link';
import { C } from './theme';

export function CommandHeader({
  greeting, dateStr, onRefresh,
}: {
  greeting: string;
  dateStr: string;
  onRefresh: () => void;
}) {
  return (
    <header
      className="flex items-end justify-between gap-4 flex-wrap pb-4 mb-1"
      style={{ borderBottom: `1px solid ${C.borderSoft}` }}
    >
      <div className="min-w-0">
        <h1
          className="text-[22px] sm:text-[26px] font-bold leading-tight"
          style={{ color: C.text, letterSpacing: '-0.022em' }}
        >
          {greeting}, מה צריך לבצע היום?
        </h1>
        <p className="text-[12px] mt-1.5" style={{ color: C.textSoft }}>
          <span className="font-semibold" style={{ color: C.text }}>{dateStr}</span>
          <span className="mx-1.5">·</span>
          <span>לוח עבודה יומי להזמנות, משלוחים, תשלומים ומלאי</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors"
          style={{ borderColor: C.border, color: C.textSoft, backgroundColor: C.card }}
          aria-label="רענון נתונים"
          title="רענון נתונים"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-9 9c-2.4 0-4.6-.9-6.3-2.4" />
            <path d="M3 12a9 9 0 0 1 9-9c2.4 0 4.6.9 6.3 2.4" />
            <polyline points="3 18 3 12 9 12" />
            <polyline points="21 6 21 12 15 12" />
          </svg>
        </button>
        <Link
          href="/orders/new"
          className="inline-flex items-center gap-1.5 px-4 h-10 text-[13px] font-semibold rounded-lg transition-colors"
          style={{
            backgroundColor: C.espresso,
            color: '#FFFFFF',
            boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(122,74,39,0.18)`,
          }}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          הזמנה חדשה
        </Link>
      </div>
    </header>
  );
}
