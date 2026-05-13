'use client';

// Internal navigation between the 6 panels. Renders as a quiet underline
// row (NOT pill chips) so it reads as a real tab bar — premium SaaS look,
// not a "filter chip" treatment. Counts appear as small muted numbers
// next to each label so the user can see at a glance which areas have work.

import type { DashboardTab } from './types';

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview',    label: 'הכל יחד' },
  { id: 'today',       label: 'היום' },
  { id: 'orders',      label: 'הזמנות' },
  { id: 'deliveries',  label: 'משלוחים' },
  { id: 'payments',    label: 'תשלומים' },
  { id: 'inventory',   label: 'מלאי' },
];

export function DashboardTabs({
  active, counts, onChange,
}: {
  active: DashboardTab;
  counts: Partial<Record<DashboardTab, number>>;
  onChange: (t: DashboardTab) => void;
}) {
  return (
    <div
      className="flex items-end gap-1 overflow-x-auto"
      style={{ borderBottom: '1px solid #E8DED2' }}
      role="tablist"
      aria-label="חלוניות עבודה"
    >
      {TABS.map(t => {
        const isActive = t.id === active;
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            role="tab"
            aria-selected={isActive}
            className="inline-flex items-baseline gap-1.5 px-3 pb-2.5 pt-1 text-[13px] font-semibold whitespace-nowrap transition-colors relative"
            style={{
              color: isActive ? '#2B1A10' : '#8A735F',
            }}
          >
            <span>{t.label}</span>
            {typeof count === 'number' && count > 0 && (
              <span
                className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md"
                style={{
                  backgroundColor: isActive ? '#7A4A27' : '#F4E8D8',
                  color: isActive ? '#FFFFFF' : '#7A4A27',
                  fontWeight: 700,
                }}
              >
                {count}
              </span>
            )}
            {isActive && (
              <span
                className="absolute right-0 left-0 -bottom-px"
                style={{
                  height: 2,
                  backgroundColor: '#7A4A27',
                  borderRadius: '2px 2px 0 0',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
