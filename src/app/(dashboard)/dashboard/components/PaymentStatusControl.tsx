'use client';

// Inline payment-status control. Visually distinct from OrderStatusStepper
// — colour-per-status chips rather than a unified segmented background, so
// the user reads "this is the money line" at a glance. Each chip carries
// its own tone (amber/gold/green/red) and stays muted when inactive.
//
// IMPORTANT: 'שולם' delegates to the parent's mark-paid handler — that
// handler opens the existing MarkPaidModal so the user picks אופן_תשלום
// before the status flips. Other statuses fire a direct PATCH. NEITHER
// path triggers Morning — auto-document creation stays off (gated by
// AUTO_CREATE_MORNING_DOCUMENTS in src/lib/morning.ts).

import { C } from './theme';

export type PaymentStatusValue = 'ממתין' | 'חלקי' | 'שולם' | 'בוטל';

const CHIPS: {
  value: PaymentStatusValue;
  label: string;
  bg: string;
  text: string;
  border: string;
  activeBg: string;
  activeText: string;
}[] = [
  {
    value: 'ממתין', label: 'ממתין',
    bg: '#FFFFFF', text: C.amber, border: C.borderSoft,
    activeBg: C.amber, activeText: '#FFFFFF',
  },
  {
    value: 'חלקי',  label: 'חלקי',
    bg: '#FFFFFF', text: C.gold, border: C.borderSoft,
    activeBg: C.gold, activeText: '#FFFFFF',
  },
  {
    value: 'שולם',  label: 'שולם',
    bg: '#FFFFFF', text: C.green, border: C.borderSoft,
    activeBg: C.green, activeText: '#FFFFFF',
  },
  {
    value: 'בוטל',  label: 'בוטל',
    bg: '#FFFFFF', text: C.red, border: C.borderSoft,
    activeBg: C.red, activeText: '#FFFFFF',
  },
];

export function PaymentStatusControl({
  current, onChange, disabled,
}: {
  current: string;
  onChange: (next: PaymentStatusValue) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-lg"
      // Quiet pill-tray treatment so the payment row reads as a single
      // unit, distinct from the order stepper above.
      style={{ backgroundColor: C.surface, border: `1px solid ${C.borderSoft}` }}
      role="radiogroup"
      aria-label="סטטוס תשלום"
    >
      <span
        className="inline-flex items-center justify-center text-[10.5px] font-bold"
        style={{ color: C.textSoft }}
        aria-hidden
      >
        ₪
      </span>
      {CHIPS.map(c => {
        const active = current === c.value;
        return (
          <button
            key={c.value}
            onClick={(e) => {
              e.stopPropagation();
              if (!active && !disabled) onChange(c.value);
            }}
            disabled={disabled || active}
            role="radio"
            aria-checked={active}
            className="text-[10.5px] font-semibold px-2 h-6 rounded-md transition-colors disabled:cursor-default"
            style={{
              backgroundColor: active ? c.activeBg : 'transparent',
              color:           active ? c.activeText : c.text,
              border:          `1px solid ${active ? c.activeBg : 'transparent'}`,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
