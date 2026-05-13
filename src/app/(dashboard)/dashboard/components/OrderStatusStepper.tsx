'use client';

// Compact segmented control for סטטוס_הזמנה. Each pill calls e.stopPropagation
// before invoking onChange so that pressing a pill inside a clickable row
// doesn't accidentally also navigate. The active pill is filled brand brown;
// inactive pills are quiet outline pills. Disabled while a write is in
// flight on this row.

import { C } from './theme';

// API values mirror the DB enum exactly. Labels can be shortened for the UI.
export type OrderStatusValue = 'חדשה' | 'בהכנה' | 'מוכנה למשלוח' | 'נשלחה' | 'הושלמה בהצלחה' | 'בוטלה';

const STEPS: { value: OrderStatusValue; label: string }[] = [
  { value: 'חדשה',           label: 'חדשה'   },
  { value: 'בהכנה',          label: 'בהכנה'  },
  { value: 'מוכנה למשלוח',   label: 'מוכנה'  },
  { value: 'נשלחה',          label: 'נשלחה'  },
  { value: 'הושלמה בהצלחה',  label: 'הושלמה' },
];

export function OrderStatusStepper({
  current, onChange, disabled,
}: {
  current: string;
  onChange: (next: OrderStatusValue) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-md"
      style={{ backgroundColor: C.surface, border: `1px solid ${C.borderSoft}` }}
      role="radiogroup"
      aria-label="סטטוס הזמנה"
    >
      {STEPS.map(s => {
        const active = current === s.value;
        return (
          <button
            key={s.value}
            onClick={(e) => {
              e.stopPropagation();
              if (!active && !disabled) onChange(s.value);
            }}
            disabled={disabled || active}
            role="radio"
            aria-checked={active}
            className="text-[11px] font-semibold px-2.5 h-6 rounded transition-colors disabled:cursor-default"
            style={{
              backgroundColor: active ? C.espresso : 'transparent',
              color:           active ? '#FFFFFF'  : C.textSoft,
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
