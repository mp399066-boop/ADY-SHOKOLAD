'use client';

// One urgency band inside the WorkQueue.

import { C } from './theme';
import { WorkQueueItem, type WorkQueueItemHandlers } from './WorkQueueItem';
import type { QueueItem } from './queue-builder';

const TONE: Record<'red' | 'amber' | 'muted', { bg: string; text: string }> = {
  red:   { bg: C.redSoft,   text: C.red   },
  amber: { bg: C.amberSoft, text: C.amber },
  muted: { bg: C.surface,   text: C.textSoft },
};

export function WorkQueueSection({
  title, tone, items, updatingId, handlers,
}: {
  title: string;
  tone: 'red' | 'amber' | 'muted';
  items: QueueItem[];
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  if (items.length === 0) return null;
  const t = TONE[tone];
  return (
    <section>
      <header
        className="flex items-center justify-between px-4 py-2"
        style={{
          backgroundColor: t.bg,
          color: t.text,
          borderTop: `1px solid ${C.borderSoft}`,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        <span className="text-[11.5px] font-bold uppercase" style={{ letterSpacing: '0.06em' }}>{title}</span>
        <span className="text-[10.5px] font-semibold tabular-nums">{items.length}</span>
      </header>
      <ul>
        {items.map((it, idx) => {
          // Mark this row as "updating" only when the underlying entity matches
          // the row we're currently writing to. Other rows stay enabled.
          const entityId = it.entity?.kind === 'order'    ? it.entity.data.id
                        : it.entity?.kind === 'delivery' ? it.entity.data.id
                        : null;
          const updating = !!entityId && entityId === updatingId;
          return (
            <WorkQueueItem
              key={it.id}
              item={it}
              isLast={idx === items.length - 1}
              updating={updating}
              handlers={handlers}
            />
          );
        })}
      </ul>
    </section>
  );
}
