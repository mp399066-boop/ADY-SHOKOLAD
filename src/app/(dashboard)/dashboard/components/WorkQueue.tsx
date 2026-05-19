'use client';

// Daily work board — 4 workflow columns organised by *stage*, not by type.
// Operator reads left-to-right (RTL right-to-left visually):
//   דחוף עכשיו → הזמנות להיום → משלוחים → תשלומים
// Stock alerts live in the side panel (DashboardInventoryAlerts) so they
// don't compete with actionable order/delivery/payment work here.
// Filter chips removed — the columns themselves provide the filtering.

import Link from 'next/link';
import { useMemo } from 'react';
import { C } from './theme';
import { DashboardEmptyState } from './DashboardEmptyState';
import type { QueueItem } from './queue-builder';
import type { WorkQueueItemHandlers } from './WorkQueueItem';
import { WorkQueueItem } from './WorkQueueItem';

const COL_LIMIT = 5;

type ColDef = {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  empty: string;
  seeAll: string | null;
  filter: (item: QueueItem) => boolean;
};

const BOARD_COLUMNS: ColDef[] = [
  {
    key: 'urgent',
    title: 'דחוף עכשיו',
    subtitle: 'מה שלא יכול לחכות',
    accent: C.red,
    empty: 'אין פריטים דחופים כרגע.',
    seeAll: null,
    filter: (it) => it.urgency === 'urgent_now',
  },
  {
    key: 'today_orders',
    title: 'הזמנות להיום',
    subtitle: 'בהכנה ולאיסוף',
    accent: C.brand,
    empty: 'אין הזמנות להיום.',
    seeAll: '/orders?filter=today',
    filter: (it) => it.type === 'order' && it.urgency !== 'urgent_now',
  },
  {
    key: 'deliveries',
    title: 'משלוחים',
    subtitle: 'שיוך שליחים ומעקב מסירה',
    accent: C.blue,
    empty: 'אין משלוחים פעילים.',
    seeAll: '/deliveries',
    filter: (it) => it.type === 'delivery' && it.urgency !== 'urgent_now',
  },
  {
    key: 'payments',
    title: 'תשלומים',
    subtitle: 'חובות פתוחים לסגירה',
    accent: C.amber,
    empty: 'אין תשלומים פתוחים.',
    seeAll: '/orders?filter=unpaid',
    filter: (it) => it.type === 'payment',
  },
];

export function WorkQueue({
  items, updatingId, handlers,
}: {
  items: QueueItem[];
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  const colData = useMemo(
    () => BOARD_COLUMNS.map(col => ({ col, colItems: items.filter(col.filter) })),
    [items],
  );

  const totalActionable = colData.reduce((s, { colItems }) => s + colItems.length, 0);

  // Show empty state when either there are truly no items, or all items are
  // stock-only (stock lives in the side panel, not the work board columns).
  if (items.length === 0 || totalActionable === 0) {
    return (
      <section
        className="rounded-2xl"
        style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
      >
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
            מחולק לפי שלב עבודה — נכנסים לעמודה, סוגרים טיפול, ממשיכים הלאה.
          </p>
        </div>
        <div
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[11.5px] font-bold"
          style={{ backgroundColor: C.card, color: C.textSoft, border: `1px solid ${C.border}` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.green }} />
          {totalActionable} פעולות פתוחות
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {colData.map(({ col, colItems }) => {
          if (colItems.length === 0) return null;
          return (
            <ActionColumn
              key={col.key}
              title={col.title}
              subtitle={col.subtitle}
              accent={col.accent}
              empty={col.empty}
              items={colItems}
              seeAll={col.seeAll}
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
  seeAll,
  updatingId,
  handlers,
}: {
  title: string;
  subtitle: string;
  accent: string;
  empty: string;
  items: QueueItem[];
  seeAll: string | null;
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  const visible = items.slice(0, COL_LIMIT);
  const overflow = items.length - COL_LIMIT;

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRight: `3px solid ${accent}`,
        boxShadow: '0 6px 18px rgba(47,27,20,0.045)',
      }}
    >
      <header
        className="px-3 py-2.5"
        style={{ borderBottom: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFFFF' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="text-[13.5px] font-bold" style={{ color: C.text }}>{title}</h3>
            <span className="text-[11px] truncate" style={{ color: C.textMuted }}>· {subtitle}</span>
          </div>
          <span
            className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[11px] font-bold tabular-nums flex-shrink-0"
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
        <>
          <ul className="p-2 space-y-1.5">
            {visible.map(item => {
              const entityId =
                item.entity?.kind === 'order'    ? item.entity.data.id
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
          {overflow > 0 && seeAll && (
            <div className="px-3 pb-2.5" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <Link
                href={seeAll}
                className="flex items-center justify-center gap-1 pt-2 text-[11.5px] font-semibold transition-opacity hover:opacity-70"
                style={{ color: C.textSoft }}
              >
                עוד {overflow} פריטים ←
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
