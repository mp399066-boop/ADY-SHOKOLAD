'use client';

// Daily work queue. Renders the list of QueueItems in 4 categorical columns
// (order / payment / delivery / stock) with a row of quick filter chips on
// top so the operator can narrow the view without leaving the dashboard.
//
// Filtering is local UI state — it does NOT mutate or refetch data, only
// hides items from the current render. All status / payment / delivery
// handlers are pass-through to the page; no business logic here.

import { useMemo, useState } from 'react';
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

type Filter = 'all' | 'urgent' | 'today' | 'payment' | 'delivery' | 'stock';

const FILTER_CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',      label: 'הכל'              },
  { value: 'urgent',   label: 'דחוף עכשיו'      },
  { value: 'today',    label: 'להיום'           },
  { value: 'payment',  label: 'ממתין לתשלום'    },
  { value: 'delivery', label: 'משלוחים'         },
  { value: 'stock',    label: 'מלאי חסר'        },
];

function applyFilter(items: QueueItem[], filter: Filter): QueueItem[] {
  switch (filter) {
    case 'urgent':   return items.filter(it => it.urgency === 'urgent_now');
    case 'today':    return items.filter(it => it.urgency === 'urgent_now' || it.urgency === 'today');
    case 'payment':  return items.filter(it => it.type === 'payment');
    case 'delivery': return items.filter(it => it.type === 'delivery');
    case 'stock':    return items.filter(it => it.type === 'stock');
    case 'all':
    default:         return items;
  }
}

export function WorkQueue({
  items, updatingId, handlers,
}: {
  items: QueueItem[];
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => applyFilter(items, filter), [items, filter]);

  // Counts shown next to each chip. Computed off the *unfiltered* list so the
  // numbers represent total available work, not the current view.
  const counts = useMemo(() => ({
    all:      items.length,
    urgent:   items.filter(it => it.urgency === 'urgent_now').length,
    today:    items.filter(it => it.urgency === 'urgent_now' || it.urgency === 'today').length,
    payment:  items.filter(it => it.type === 'payment').length,
    delivery: items.filter(it => it.type === 'delivery').length,
    stock:    items.filter(it => it.type === 'stock').length,
  }), [items]);

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
          {filtered.length} מתוך {items.length} פעולות
        </div>
      </div>

      {/* Filter chips — pure UI, no fetch / no mutation */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map(chip => {
          const active = filter === chip.value;
          const count = counts[chip.value];
          return (
            <button
              key={chip.value}
              onClick={() => setFilter(chip.value)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11.5px] font-semibold transition-colors"
              style={{
                backgroundColor: active ? C.espresso : '#FFFFFF',
                color: active ? '#FFFFFF' : C.text,
                border: `1px solid ${active ? C.espresso : C.border}`,
              }}
            >
              {chip.label}
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums"
                style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.18)' : C.brandSoft,
                  color: active ? '#FFFFFF' : C.brand,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {BOARD_COLUMNS.map(column => {
          const columnItems = filtered.filter(item => item.type === column.type);
          // Hide empty columns when a filter is active — the user picked a
          // narrow view, don't push empty placeholders into their face.
          if (filter !== 'all' && columnItems.length === 0) return null;
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
      <header className="px-3 py-2.5" style={{ borderBottom: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFFFF' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
            <h3 className="text-[13.5px] font-bold" style={{ color: C.text }}>{title}</h3>
            <span className="text-[11px]" style={{ color: C.textMuted }}>· {subtitle}</span>
          </div>
          <span
            className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[11px] font-bold tabular-nums"
            style={{ color: accent, backgroundColor: C.card, border: `1px solid ${C.border}` }}
          >
            {items.length}
          </span>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px]" style={{ color: C.textSoft }}>
          {empty}
        </div>
      ) : (
        <ul className="p-2 space-y-1.5">
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
