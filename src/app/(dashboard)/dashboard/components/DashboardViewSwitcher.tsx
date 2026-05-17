'use client';

import { C } from './theme';

export type DashboardMode = 'management' | 'kitchen' | 'attendance';

export function DashboardViewSwitcher({
  mode,
  onChange,
}: {
  mode: DashboardMode;
  onChange: (mode: DashboardMode) => void;
}) {
  const mainOptions: Array<{ id: DashboardMode; label: string }> = [
    { id: 'management', label: 'תצוגת ניהול' },
    { id: 'kitchen',    label: 'תצוגת מטבח'  },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Main view switcher */}
      <div className="inline-flex rounded-lg border p-1" style={{ backgroundColor: C.card, borderColor: C.border }}>
        {mainOptions.map(option => {
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className="h-9 rounded-md px-4 text-sm font-bold transition-colors"
              style={{
                backgroundColor: active ? C.espresso : 'transparent',
                color: active ? '#FFFFFF' : C.textSoft,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Attendance — top-level daily action, visually distinct */}
      <button
        type="button"
        onClick={() => onChange('attendance')}
        className="flex h-11 items-center gap-2 rounded-xl border-2 px-5 text-sm font-bold transition-colors"
        style={{
          backgroundColor: mode === 'attendance' ? C.cocoa : C.brandSoft,
          borderColor:     mode === 'attendance' ? C.cocoa : C.gold,
          color:           mode === 'attendance' ? '#FFFFFF' : C.brand,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
        נוכחות עובדות
      </button>
    </div>
  );
}
