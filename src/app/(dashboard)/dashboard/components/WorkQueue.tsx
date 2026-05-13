'use client';

import { C } from './theme';
import { DashboardEmptyState } from './DashboardEmptyState';
import type { QueueItem, QueueItemType } from './queue-builder';
import type { WorkQueueItemHandlers } from './WorkQueueItem';
import { WorkQueueItem } from './WorkQueueItem';

const BOARD_COLUMNS: {
  type: QueueItemType;
  title: string;
  subtitle: string;
  accent: string;
  empty: string;
}[] = [
  {
    type: 'order',
    title: 'עדכון סטטוס הזמנה',
    subtitle: 'הזמנות שצריכות להתקדם לשלב הבא',
    accent: C.brand,
    empty: 'אין הזמנות שממתינות לעדכון סטטוס.',
  },
  {
    type: 'payment',
    title: 'עדכון תשלום',
    subtitle: 'חובות, חלקי ותשלומים לסגירה',
    accent: C.amber,
    empty: 'אין תשלומים פתוחים לטיפול.',
  },
  {
    type: 'delivery',
    title: 'עדכון סטטוס משלוח',
    subtitle: 'איסוף, מסירה ומעקב שליחים',
    accent: C.blue,
    empty: 'אין משלוחים פעילים כרגע.',
  },
  {
    type: 'stock',
    title: 'מלאי וייצור',
    subtitle: 'חוסרים ופריטים שדורשים הכנה',
    accent: C.red,
    empty: 'אין התראות מלאי דחופות.',
  },
];

export function WorkQueue({
  items, updatingId, handlers,
}: {
  items: QueueItem[];
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        <DashboardEmptyState
          title="היום רגוע"
          subtitle="אין פעולות שממתינות לטיפול כרגע"
        />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: C.text }}>
            לוח פעולות יומי
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: C.textSoft }}>
            מחולק לפי הפעולה שצריך לבצע, כדי לעבוד מהר וברור.
          </p>
        </div>
        <div
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[11.5px] font-bold"
          style={{ backgroundColor: C.card, color: C.textSoft, border: `1px solid ${C.border}` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.green }} />
          {items.length} פעולות פתוחות
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {BOARD_COLUMNS.map(column => {
          const columnItems = items.filter(item => item.type === column.type);
          return (
            <ActionColumn
              key={column.type}
              title={column.title}
              subtitle={column.subtitle}
              accent={column.accent}
              empty={column.empty}
              items={columnItems}
              updatingId={updatingId}
              handlers={handlers}
            />
          );
        })}
      </div>
    </section>
  );
}

function ActionColumn({
  title,
  subtitle,
  accent,
  empty,
  items,
  updatingId,
  handlers,
}: {
  title: string;
  subtitle: string;
  accent: string;
  empty: string;
  items: QueueItem[];
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 6px 18px rgba(47,27,20,0.045)' }}
    >
      <header className="px-3 py-3" style={{ borderBottom: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFFFF' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
              <h3 className="text-[14.5px] font-bold" style={{ color: C.text }}>{title}</h3>
            </div>
            <p className="text-[11.5px] mt-1" style={{ color: C.textSoft }}>{subtitle}</p>
          </div>
          <span
            className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-[11.5px] font-bold"
            style={{ color: accent, backgroundColor: C.card, border: `1px solid ${C.border}` }}
          >
            {items.length}
          </span>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="px-3 py-5 text-center text-[12px]" style={{ color: C.textSoft }}>
          {empty}
        </div>
      ) : (
        <ul className="p-2 space-y-2">
          {items.map(item => {
            const entityId = item.entity?.kind === 'order' ? item.entity.data.id
              : item.entity?.kind === 'delivery' ? item.entity.data.id
              : null;
            const updating = !!entityId && entityId === updatingId;
            return (
              <WorkQueueItem
                key={item.id}
                item={item}
                updating={updating}
                handlers={handlers}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
