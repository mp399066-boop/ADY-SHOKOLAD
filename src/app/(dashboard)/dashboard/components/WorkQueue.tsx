'use client';

// Centerpiece of the dashboard. The list IS the dashboard.

import { C } from './theme';
import { WorkQueueSection } from './WorkQueueSection';
import { DashboardEmptyState } from './DashboardEmptyState';
import type { QueueItem } from './queue-builder';
import type { WorkQueueItemHandlers } from './WorkQueueItem';

export function WorkQueue({
  items, updatingId, handlers,
}: {
  items: QueueItem[];
  updatingId: string | null;
  handlers: WorkQueueItemHandlers;
}) {
  const urgent   = items.filter(i => i.urgency === 'urgent_now');
  const today    = items.filter(i => i.urgency === 'today');
  const followUp = items.filter(i => i.urgency === 'follow_up');

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 2px rgba(58,42,26,0.04), 0 4px 16px rgba(58,42,26,0.04)',
      }}
    >
      <header
        className="px-5 py-4"
        style={{ backgroundColor: C.cardSoft, borderBottom: `1px solid ${C.border}` }}
      >
        <h2 className="text-[15px] font-bold leading-tight" style={{ color: C.text, letterSpacing: '-0.01em' }}>
          סדר עבודה להיום
        </h2>
        <p className="text-[11.5px] mt-1" style={{ color: C.textSoft }}>
          מה שמצריך טיפול לפי דחיפות
        </p>
      </header>

      {items.length === 0 ? (
        <DashboardEmptyState
          title="הכל בשליטה"
          subtitle="אין פריטים שדורשים טיפול דחוף כרגע"
        />
      ) : (
        <>
          <WorkQueueSection title="דחוף עכשיו" tone="red"   items={urgent}   updatingId={updatingId} handlers={handlers} />
          <WorkQueueSection title="להיום"      tone="amber" items={today}    updatingId={updatingId} handlers={handlers} />
          <WorkQueueSection title="למעקב"      tone="muted" items={followUp} updatingId={updatingId} handlers={handlers} />
        </>
      )}
    </div>
  );
}
