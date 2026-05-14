'use client';

import { C } from './theme';

export function DashboardViewSwitcher({
  mode,
  onChange,
}: {
  mode: 'management' | 'kitchen';
  onChange: (mode: 'management' | 'kitchen') => void;
}) {
  const options = [
    { id: 'management' as const, label: 'תצוגת ניהול' },
    { id: 'kitchen' as const, label: 'תצוגת מטבח' },
  ];

  return (
    <div className="flex justify-start">
      <div className="inline-flex rounded-lg border p-1" style={{ backgroundColor: C.card, borderColor: C.border }}>
        {options.map(option => {
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
    </div>
  );
}
