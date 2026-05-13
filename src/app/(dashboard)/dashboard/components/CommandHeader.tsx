'use client';

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
      className="rounded-xl px-4 py-3.5 sm:px-5"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 6px 18px rgba(47,27,20,0.045)' }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold mb-0.5" style={{ color: C.gold }}>
            {dateStr}
          </p>
          <h1 className="text-[21px] sm:text-[25px] font-bold leading-tight" style={{ color: C.text, letterSpacing: 0 }}>
            {greeting}, זה לוח העבודה של היום
          </h1>
          <p className="text-[12px] mt-1 leading-5 max-w-3xl" style={{ color: C.textSoft }}>
            עדכוני הזמנות, תשלומים, משלוחים ומלאי מחולקים לפי פעולה. נכנסים לעמודה, סוגרים טיפול, ממשיכים הלאה.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors"
            style={{ borderColor: C.border, color: C.brand, backgroundColor: C.card }}
            aria-label="רענון נתונים"
            title="רענון נתונים"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 1-9 9c-2.4 0-4.6-.9-6.3-2.4" />
              <path d="M3 12a9 9 0 0 1 9-9c2.4 0 4.6.9 6.3 2.4" />
              <polyline points="3 18 3 12 9 12" />
              <polyline points="21 6 21 12 15 12" />
            </svg>
          </button>
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-2 px-4 h-9 text-[12px] font-bold rounded-lg transition-colors"
            style={{ backgroundColor: C.espresso, color: '#FFFFFF', boxShadow: '0 5px 12px rgba(47,27,20,0.13)' }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            הזמנה חדשה
          </Link>
        </div>
      </div>
    </header>
  );
}
