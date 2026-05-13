'use client';

import { Fragment } from 'react';
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
    value: 'חלקי', label: 'חלקי',
    bg: '#FFFFFF', text: C.gold, border: C.borderSoft,
    activeBg: C.gold, activeText: '#FFFFFF',
  },
  {
    value: 'שולם', label: 'שולם',
    bg: '#FFFFFF', text: C.green, border: C.borderSoft,
    activeBg: C.green, activeText: '#FFFFFF',
  },
  {
    value: 'בוטל', label: 'בוטל',
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
  if (current === 'בארטר') {
    return (
      <span
        className="inline-flex h-7 items-center rounded-lg px-2.5 text-[11px] font-bold"
        style={{ backgroundColor: C.brandSoft, color: C.brand, border: `1px solid ${C.borderSoft}` }}
      >
        בארטר
      </span>
    );
  }

  const currentIdx = Math.max(0, CHIPS.findIndex(c => c.value === current));

  return (
    <div
      className="inline-flex items-start max-w-full overflow-x-auto px-1 pb-1"
      role="radiogroup"
      aria-label="סטטוס תשלום"
    >
      {CHIPS.map((c, idx) => {
        const active = current === c.value;
        const reached = idx <= currentIdx;
        return (
          <Fragment key={c.value}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!active && !disabled) onChange(c.value);
              }}
              disabled={disabled || active}
              role="radio"
              aria-checked={active}
              className="flex flex-col items-center gap-1 flex-shrink-0 disabled:cursor-default"
              style={{ minWidth: 42 }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition-all"
                style={{
                  backgroundColor: active ? c.activeBg : reached ? c.bg : C.card,
                  color: active ? c.activeText : c.text,
                  border: `1px solid ${active ? c.activeBg : c.border}`,
                  boxShadow: active ? `0 0 0 3px ${c.activeBg}22` : 'none',
                }}
              >
                {idx + 1}
              </span>
              <span
                className="text-[9.5px] whitespace-nowrap"
                style={{ color: active ? C.text : c.text, fontWeight: active ? 700 : 600 }}
              >
                {c.label}
              </span>
            </button>
            {idx < CHIPS.length - 1 && (
              <span
                className="flex-shrink-0 rounded-full"
                style={{
                  width: 20,
                  height: 2,
                  marginTop: 9,
                  backgroundColor: idx + 1 <= currentIdx ? c.activeBg : C.border,
                }}
                aria-hidden
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
