'use client';

// Order-status as a real process flow: numbered circles connected by a
// progress line. Past steps are filled brown with a check mark, the current
// step is a slightly larger filled circle (visual anchor), future steps are
// outlined with a muted number. The connector segment leading to a step
// inherits the filled colour iff that step is past or current.
//
// IMPORTANT: only handles the active progression (חדשה → … → הושלמה
// בהצלחה). 'בוטלה' / 'טיוטה' don't appear here — those orders are filtered
// out of the dashboard queue at the page.tsx level. If a user manually
// transitions to בוטלה via MoreActions, the row disappears from the queue
// on the next refresh.

import { Fragment } from 'react';
import { C } from './theme';

export type OrderStatusValue = 'חדשה' | 'בהכנה' | 'מוכנה למשלוח' | 'נשלחה' | 'הושלמה בהצלחה' | 'בוטלה';

const STEPS: { value: OrderStatusValue; label: string }[] = [
  { value: 'חדשה',           label: 'חדשה'   },
  { value: 'בהכנה',          label: 'בהכנה'  },
  { value: 'מוכנה למשלוח',   label: 'מוכנה'  },
  { value: 'נשלחה',          label: 'נשלחה'  },
  { value: 'הושלמה בהצלחה',  label: 'הושלמה' },
];

const CIRCLE = {
  past:    16,
  current: 20,
  future:  16,
};

export function OrderStatusStepper({
  current, onChange, disabled,
}: {
  current: string;
  onChange: (next: OrderStatusValue) => void;
  disabled?: boolean;
}) {
  // Cancelled / draft / unknown: show a single small chip instead of a
  // misleading half-empty progress bar.
  if (current === 'בוטלה') {
    return (
      <span
        className="inline-flex items-center text-[10.5px] font-bold uppercase px-2 py-1 rounded-md"
        style={{ backgroundColor: C.redSoft, color: C.red, letterSpacing: '0.06em' }}
      >
        בוטלה
      </span>
    );
  }
  if (current === 'טיוטה') {
    return (
      <span
        className="inline-flex items-center text-[10.5px] font-bold uppercase px-2 py-1 rounded-md"
        style={{ backgroundColor: C.surface, color: C.textSoft, letterSpacing: '0.06em' }}
      >
        טיוטה
      </span>
    );
  }

  const currentIdx = Math.max(0, STEPS.findIndex(s => s.value === current));
  const lastIdx = STEPS.length - 1;

  return (
    <div
      className="inline-flex items-start gap-0 max-w-full overflow-x-auto pb-0.5"
      role="radiogroup"
      aria-label="סטטוס הזמנה"
    >
      {STEPS.map((s, idx) => {
        const past    = idx <  currentIdx;
        const isCur   = idx === currentIdx;
        const future  = idx >  currentIdx;
        const size    = isCur ? CIRCLE.current : past ? CIRCLE.past : CIRCLE.future;

        return (
          <Fragment key={s.value}>
            {/* Step button = circle + label, vertically stacked */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isCur && !disabled) onChange(s.value);
              }}
              disabled={disabled || isCur}
              role="radio"
              aria-checked={isCur}
              aria-label={`שינוי סטטוס ל${s.label}`}
              className="flex flex-col items-center gap-0.5 flex-shrink-0 disabled:cursor-default group"
              style={{ minWidth: 36 }}
            >
              <span
                className="rounded-full flex items-center justify-center text-[9px] font-bold transition-all"
                style={{
                  width:  size,
                  height: size,
                  // Past + current both filled with espresso for a continuous
                  // progress visual; future is outlined cream.
                  backgroundColor: past || isCur ? C.espresso : C.card,
                  color:           past || isCur ? '#FFFFFF'  : C.textMuted,
                  border:          past || isCur ? `1px solid ${C.espresso}` : `1.5px solid ${C.border}`,
                  // Soft ring around the current step so it reads as the anchor
                  boxShadow:       isCur ? `0 0 0 3px ${C.espresso}1A` : 'none',
                }}
              >
                {past ? (
                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4 10-10" />
                  </svg>
                ) : isCur ? (
                  <span style={{ fontSize: 10 }}>{idx + 1}</span>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </span>
              <span
                className="text-[9.5px] whitespace-nowrap transition-colors"
                style={{
                  color:      isCur ? C.text : past ? C.textSoft : C.textMuted,
                  fontWeight: isCur ? 700    : past ? 600        : 500,
                }}
              >
                {s.label}
              </span>
            </button>

            {/* Connector — fills if the step it leads INTO is past/current */}
            {idx < lastIdx && (
              <span
                className="flex-shrink-0"
                style={{
                  width:           14,
                  height:          2,
                  // marginTop centers the line on the smaller (past/future)
                  // circle vertical midline (18/2 - 2/2 = 8). Current step is
                  // larger but its visual center is still aligned to the line
                  // because the row is items-start and the circle is in the
                  // first slot of the column (above the label).
                  marginTop:       8,
                  // The segment AFTER step `idx` carries past colour iff the
                  // NEXT step (idx+1) has already been reached.
                  backgroundColor: idx + 1 <= currentIdx ? C.espresso : C.border,
                  borderRadius:    1,
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
