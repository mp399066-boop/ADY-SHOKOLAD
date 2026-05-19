'use client';

// Side-rail quick-action strip. Compact 4-button grid so the operator
// can jump to common entry points without leaving the dashboard.
// Alert counts removed — they now live in FocusStrip (KPI row) and the
// dedicated side panels: DashboardInventoryAlerts + DashboardEmployeeTasks.

import Link from 'next/link';
import { C } from './theme';

export function AttentionPanel() {
  return (
    <aside>
      <section
        className="rounded-xl p-2.5"
        style={{
          backgroundColor: '#FFFFFF',
          border: `1px solid ${C.border}`,
          boxShadow: '0 4px 14px rgba(47,27,20,0.04)',
        }}
      >
        <h2
          className="text-[12.5px] font-bold mb-2 px-0.5"
          style={{ color: C.textSoft, letterSpacing: '0.02em' }}
        >
          פעולות מהירות
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction href="/orders/new" label="הזמנה חדשה">
            <path d="M12 5v14M5 12h14" />
          </QuickAction>
          <QuickAction href="/customers/new" label="לקוח חדש">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </QuickAction>
          <QuickAction href="/inventory" label="מלאי">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.3 7 12 12l8.7-5" />
            <path d="M12 22V12" />
          </QuickAction>
          <QuickAction href="/employees" label="משימות">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </QuickAction>
        </div>
      </section>
    </aside>
  );
}

function QuickAction({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg p-2 transition-all hover:-translate-y-px"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.text }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full transition-colors shrink-0"
        style={{ backgroundColor: C.brandSoft, color: C.brand }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </svg>
      </span>
      <span className="text-[11.5px] font-bold truncate">{label}</span>
    </Link>
  );
}
