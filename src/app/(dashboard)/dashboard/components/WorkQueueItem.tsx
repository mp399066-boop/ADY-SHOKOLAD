'use client';

// Single row in the work queue. Width: 100% of the queue card. Layout:
// [type badge | title + meta | amount | one CTA]. A 2px left edge accent
// (RTL = right edge) marks דחוף עכשיו items so the eye lands there first.

import { C } from './theme';
import type { QueueItem, QueueItemType } from './queue-builder';

export function WorkQueueItem({
  item, isLast, onAction,
}: {
  item: QueueItem;
  isLast: boolean;
  onAction: (verb: QueueItem['action']['verb']) => void;
}) {
  const tone = TYPE_TONE[item.type];
  const showEdgeAccent = item.urgency === 'urgent_now';
  return (
    <li
      className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FBF8F1] relative"
      style={{
        gridTemplateColumns: '76px minmax(0, 1fr) auto auto',
        borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}`,
      }}
    >
      {showEdgeAccent && (
        <div className="absolute top-0 right-0 bottom-0" style={{ width: 2, backgroundColor: C.red }} aria-hidden />
      )}

      {/* Type badge */}
      <span
        className="inline-flex items-center justify-center text-[10.5px] font-bold uppercase px-2 py-1 rounded-md"
        style={{
          backgroundColor: tone.bg,
          color: tone.text,
          letterSpacing: '0.06em',
        }}
      >
        {tone.label}
      </span>

      {/* Title + meta */}
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold truncate" style={{ color: C.text, letterSpacing: '-0.005em' }}>
          {item.title}
        </p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: C.textSoft }}>
          {item.meta}
        </p>
      </div>

      {/* Amount (when applicable) */}
      {item.amount ? (
        <span className="text-[13px] tabular-nums font-bold whitespace-nowrap" style={{ color: C.text }}>
          {item.amount}
        </span>
      ) : (
        <span />
      )}

      {/* Single CTA */}
      <button
        onClick={() => onAction(item.action.verb)}
        className="inline-flex items-center text-[11.5px] font-semibold px-3 h-8 rounded-md whitespace-nowrap transition-colors"
        style={{
          backgroundColor: item.urgency === 'urgent_now' ? C.espresso : C.brandSoft,
          color:           item.urgency === 'urgent_now' ? '#FFFFFF'  : C.brand,
          border:          item.urgency === 'urgent_now' ? `1px solid ${C.espresso}` : `1px solid ${C.border}`,
        }}
      >
        {item.action.label}
      </button>
    </li>
  );
}

const TYPE_TONE: Record<QueueItemType, { bg: string; text: string; label: string }> = {
  order:    { bg: C.brandSoft, text: C.brand, label: 'הזמנה' },
  delivery: { bg: C.blueSoft,  text: C.blue,  label: 'משלוח' },
  payment:  { bg: C.amberSoft, text: C.amber, label: 'תשלום' },
  stock:    { bg: C.redSoft,   text: C.red,   label: 'מלאי' },
};
