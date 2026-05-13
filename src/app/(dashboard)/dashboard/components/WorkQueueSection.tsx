'use client';

// One urgency band inside the WorkQueue.

import { C } from './theme';
import { WorkQueueItem, type WorkQueueItemHandlers } from './WorkQueueItem';
import type { QueueItem } from './queue-builder';

const TONE: Record<'red' | 'amber' | 'muted', { bg: string; text: string; dot: string }> = {
  red:   { bg: '#FFF7F5', text: C.red,      dot: C.red },
  amber: { bg: '#FFFBF4', text: C.amber,    dot: C.gold },
  muted: { bg: '#FFFCF8', text: C.textSoft, dot: C.textMuted },
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
        className="flex items-center justify-between px-5 py-3"
        style={{
          backgroundColor: t.bg,
          color: t.text,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        <span className="inline-flex items-center gap-2 text-[12px] font-bold">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.dot }} />
          {title}
        </span>
        <span
          className="inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-[11px] font-bold tabular-nums"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: t.text }}
        >
          {items.length}
        </span>
      </header>
      <ul className="p-3 space-y-2">
        {items.map((it) => {
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
              updating={updating}
              handlers={handlers}
            />
          );
        })}
      </ul>
    </section>
  );
}
