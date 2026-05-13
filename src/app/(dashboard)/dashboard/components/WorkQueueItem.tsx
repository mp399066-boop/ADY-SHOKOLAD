'use client';

// One row in the work queue. Two visual rows internally:
//   Row 1: [type chip] [title + meta]                       [amount]
//   Row 2 (orders only): [order pills] [payment pills]      [actions]
//
// The whole row is clickable (navigates to the entity's detail page) but
// every interactive element inside (status pills, action buttons) calls
// e.stopPropagation in its own click handler so the row click doesn't fire
// on accident. Stock and delivery items get the simpler one-row layout.
//
// Status pill changes use the same parent handlers as MoreActionsModal —
// confirms for sensitive transitions still appear; Morning is NOT called
// (auto-create stays gated by AUTO_CREATE_MORNING_DOCUMENTS).

import { C } from './theme';
import { OrderStatusStepper, type OrderStatusValue } from './OrderStatusStepper';
import { PaymentStatusControl, type PaymentStatusValue } from './PaymentStatusControl';
import type { QueueItem, QueueItemType } from './queue-builder';
import type { TodayOrder } from './types';

export interface WorkQueueItemHandlers {
  onAction: (verb: QueueItem['action']['verb']) => void;
  onRowClick: (item: QueueItem) => void;
  onChangeOrderStatus: (order: TodayOrder, next: OrderStatusValue) => void;
  onChangePaymentStatus: (order: TodayOrder, next: PaymentStatusValue) => void;
}

export function WorkQueueItem({
  item, isLast, updating, handlers,
}: {
  item: QueueItem;
  isLast: boolean;
  // True when an inline mutation is in flight on this row's underlying entity
  // — disables all status pills + action buttons so the user can't double-fire.
  updating: boolean;
  handlers: WorkQueueItemHandlers;
}) {
  const tone = TYPE_TONE[item.type];
  const showEdgeAccent = item.urgency === 'urgent_now';
  const isOrderRow = item.entity?.kind === 'order';
  const isDeliveryRow = item.entity?.kind === 'delivery';

  return (
    <li
      onClick={() => handlers.onRowClick(item)}
      className="group flex flex-col gap-2.5 px-4 py-3.5 cursor-pointer transition-colors relative"
      style={{
        // Soft red wash on the row when urgent — strengthens the urgency
        // signal without resorting to a saturated background.
        backgroundColor: showEdgeAccent ? '#FCF1EE' : 'transparent',
        borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = showEdgeAccent ? '#F9E7E1' : '#FBF8F1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = showEdgeAccent ? '#FCF1EE' : 'transparent'; }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlers.onRowClick(item);
        }
      }}
    >
      {showEdgeAccent && (
        <div className="absolute top-0 right-0 bottom-0" style={{ width: 3, backgroundColor: C.red }} aria-hidden />
      )}

      {/* ── Header line ─────────────────────────────────────────────────── */}
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: '76px minmax(0,1fr) auto auto' }}>
        <span
          className="inline-flex items-center justify-center text-[10.5px] font-bold uppercase px-2 py-1 rounded-md"
          style={{ backgroundColor: tone.bg, color: tone.text, letterSpacing: '0.06em' }}
        >
          {tone.label}
        </span>
        <div className="min-w-0">
          {/* Customer name — bumped up for hierarchy */}
          <p className="text-[15px] font-bold truncate" style={{ color: C.text, letterSpacing: '-0.012em', lineHeight: 1.2 }}>
            {item.title}
          </p>
          {/* Meta line — pushed down a tier so the name dominates */}
          <p className="text-[10.5px] mt-1 truncate" style={{ color: C.textSoft }}>
            {item.meta}
          </p>
        </div>
        {item.amount ? (
          <span className="text-[14px] tabular-nums font-bold whitespace-nowrap" style={{ color: C.text }}>
            {item.amount}
          </span>
        ) : <span />}
        <span
          className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
          style={{ color: C.brand }}
          aria-hidden
        >
          פתח <span aria-hidden>←</span>
        </span>
      </div>

      {/* ── Inline status pills + actions row (orders only) ─────────────── */}
      {(() => {
        // Extract the order once so the closures below capture a non-undefined
        // value (the outer narrowing on item.entity?.kind doesn't carry into
        // the inline arrow-function event handlers).
        const order: TodayOrder | null = item.entity?.kind === 'order' ? item.entity.data : null;
        if (!order) return null;
        return (
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', paddingInlineStart: 88 /* align under title column in RTL */ }}>
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusStepper
                current={order.סטטוס_הזמנה}
                disabled={updating}
                onChange={(next) => handlers.onChangeOrderStatus(order, next)}
              />
              <PaymentStatusControl
                current={order.סטטוס_תשלום}
                disabled={updating}
                onChange={(next) => handlers.onChangePaymentStatus(order, next)}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <PrimaryActionButton
                label={item.action.label}
                urgent={item.urgency === 'urgent_now'}
                disabled={updating}
                onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
              />
            </div>
          </div>
        );
      })()}

      {/* ── Action-only row for delivery / stock / non-order items ──────── */}
      {!isOrderRow && (
        <div className="flex justify-end" style={{ paddingInlineStart: 88 }}>
          <PrimaryActionButton
            label={item.action.label}
            urgent={item.urgency === 'urgent_now' || isDeliveryRow}
            disabled={updating}
            onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
          />
        </div>
      )}
    </li>
  );
}

function PrimaryActionButton({
  label, urgent, disabled, onClick,
}: {
  label: string;
  urgent: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center text-[11.5px] font-semibold px-3 h-8 rounded-md whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-default"
      style={{
        backgroundColor: urgent ? C.espresso : C.brandSoft,
        color:           urgent ? '#FFFFFF'  : C.brand,
        border:          urgent ? `1px solid ${C.espresso}` : `1px solid ${C.border}`,
      }}
    >
      {label}
    </button>
  );
}

const TYPE_TONE: Record<QueueItemType, { bg: string; text: string; label: string }> = {
  order:    { bg: C.brandSoft, text: C.brand, label: 'הזמנה' },
  delivery: { bg: C.blueSoft,  text: C.blue,  label: 'משלוח' },
  payment:  { bg: C.amberSoft, text: C.amber, label: 'תשלום' },
  stock:    { bg: C.redSoft,   text: C.red,   label: 'מלאי' },
};
