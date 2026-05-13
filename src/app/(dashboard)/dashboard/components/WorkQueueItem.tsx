'use client';

import { C } from './theme';
import { OrderStatusStepper, type OrderStatusValue } from './OrderStatusStepper';
import { PaymentStatusControl, type PaymentStatusValue } from './PaymentStatusControl';
import type { QueueItem, QueueItemType } from './queue-builder';
import type { Delivery, TodayOrder } from './types';

export interface WorkQueueItemHandlers {
  onAction: (verb: QueueItem['action']['verb']) => void;
  onRowClick: (item: QueueItem) => void;
  onChangeOrderStatus: (order: TodayOrder, next: OrderStatusValue) => void;
  onChangePaymentStatus: (order: TodayOrder, next: PaymentStatusValue) => void;
  onChangeDeliveryStatus: (delivery: Delivery, next: 'ממתין' | 'נאסף' | 'נמסר') => void;
}

const DELIVERY_STATUSES = ['ממתין', 'נאסף', 'נמסר'] as const;

export function WorkQueueItem({
  item, updating, handlers,
}: {
  item: QueueItem;
  updating: boolean;
  handlers: WorkQueueItemHandlers;
}) {
  const tone = TYPE_TONE[item.type];
  const isUrgent = item.urgency === 'urgent_now';
  const order = item.entity?.kind === 'order' ? item.entity.data : null;
  const delivery = item.entity?.kind === 'delivery' ? item.entity.data : null;
  const hasProgress = !!order || !!delivery;

  return (
    <li
      onClick={() => handlers.onRowClick(item)}
      className="group cursor-pointer rounded-xl transition-colors"
      style={{
        backgroundColor: isUrgent ? '#FFF9F6' : '#FFFFFF',
        border: `1px solid ${isUrgent ? '#E9C9C3' : C.borderSoft}`,
        boxShadow: isUrgent ? '0 8px 18px rgba(157,75,74,0.08)' : '0 4px 14px rgba(47,27,20,0.04)',
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlers.onRowClick(item);
        }
      }}
    >
      <div className="grid gap-2.5 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="inline-flex items-center justify-center text-[10px] font-bold px-2 py-1 rounded-md"
                style={{ backgroundColor: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
              >
                {tone.label}
              </span>
              {isUrgent && (
                <span
                  className="inline-flex items-center justify-center text-[10px] font-bold px-2 py-1 rounded-md"
                  style={{ backgroundColor: C.redSoft, color: C.red, border: '1px solid #E4C2BE' }}
                >
                  דחוף
                </span>
              )}
            </div>

            <p className="mt-2 text-[15px] font-bold truncate" style={{ color: C.text, letterSpacing: 0 }}>
              {item.title}
            </p>
            <p className="mt-1 text-[11.5px] leading-5 line-clamp-2" style={{ color: C.textSoft }}>
              {item.meta}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {item.amount && (
              <span
                className="inline-flex items-center justify-center text-[12px] font-bold px-2.5 h-8 rounded-lg tabular-nums"
                style={{ backgroundColor: C.card, color: C.text, border: `1px solid ${C.borderSoft}` }}
              >
                {item.amount}
              </span>
            )}
            {!hasProgress && (
              <PrimaryActionButton
                label={item.action.label}
                urgent={isUrgent || item.type === 'delivery'}
                disabled={updating}
                onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
              />
            )}
          </div>
        </div>
      </div>

      {order && (
        <div
          className="grid gap-3 px-3 py-3"
          style={{ borderTop: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFCF8' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid gap-2.5">
            <ProgressField label="סטטוס הזמנה">
              <OrderStatusStepper
                current={order.סטטוס_הזמנה}
                disabled={updating}
                onChange={(next) => handlers.onChangeOrderStatus(order, next)}
              />
            </ProgressField>

            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <ProgressField label="סטטוס תשלום">
                <PaymentStatusControl
                  current={order.סטטוס_תשלום}
                  disabled={updating}
                  onChange={(next) => handlers.onChangePaymentStatus(order, next)}
                />
              </ProgressField>

              <div className="flex justify-start pb-0.5">
                <PrimaryActionButton
                  label={item.action.label}
                  urgent={isUrgent}
                  disabled={updating}
                  onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {delivery && (
        <div
          className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          style={{ borderTop: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFCF8' }}
          onClick={(e) => e.stopPropagation()}
        >
          <CompactProgressField label="סטטוס משלוח">
            <DeliveryStatusStepper
              current={delivery.סטטוס_משלוח}
              disabled={updating}
              onChange={(next) => handlers.onChangeDeliveryStatus(delivery, next)}
            />
          </CompactProgressField>

          <div className="flex justify-start pb-0.5">
            <PrimaryActionButton
              label={item.action.label}
              urgent={isUrgent || item.type === 'delivery'}
              disabled={updating}
              onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function ProgressField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="min-w-0 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.borderSoft}` }}
    >
      <p className="mb-2 text-[10.5px] font-bold" style={{ color: C.textSoft }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function CompactProgressField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10.5px] font-bold" style={{ color: C.textSoft }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function DeliveryStatusStepper({
  current,
  disabled,
  onChange,
}: {
  current: string;
  disabled?: boolean;
  onChange: (next: 'ממתין' | 'נאסף' | 'נמסר') => void;
}) {
  const currentIdx = Math.max(0, DELIVERY_STATUSES.findIndex(status => status === current));

  return (
    <div className="inline-flex items-start gap-0 max-w-full overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="סטטוס משלוח">
      {DELIVERY_STATUSES.map((status, idx) => {
        const active = current === status;
        const reached = idx <= currentIdx;
        return (
          <span key={status} className="inline-flex items-start">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!active && !disabled) onChange(status);
              }}
              disabled={disabled || active}
              role="radio"
              aria-checked={active}
              className="flex flex-col items-center gap-1 flex-shrink-0 disabled:cursor-default"
              style={{ minWidth: 44 }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: active || reached ? C.blue : C.card,
                  color: active || reached ? '#FFFFFF' : C.textMuted,
                  border: `1px solid ${active || reached ? C.blue : C.border}`,
                  boxShadow: active ? `0 0 0 3px ${C.blue}22` : 'none',
                }}
              >
                {idx + 1}
              </span>
              <span
                className="text-[9.5px] whitespace-nowrap"
                style={{ color: active ? C.text : reached ? C.textSoft : C.textMuted, fontWeight: active ? 700 : 600 }}
              >
                {status}
              </span>
            </button>
            {idx < DELIVERY_STATUSES.length - 1 && (
              <span
                className="flex-shrink-0 rounded-full"
                style={{
                  width: 22,
                  height: 2,
                  marginTop: 9,
                  backgroundColor: idx + 1 <= currentIdx ? C.blue : C.border,
                }}
                aria-hidden
              />
            )}
          </span>
        );
      })}
    </div>
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
      className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-[12px] font-bold whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-default"
      style={{
        backgroundColor: urgent ? C.espresso : C.brand,
        color: '#FFFFFF',
        border: `1px solid ${urgent ? C.espresso : C.brand}`,
        boxShadow: '0 5px 12px rgba(47,27,20,0.13)',
      }}
    >
      {disabled ? 'מעדכן...' : label}
    </button>
  );
}

const TYPE_TONE: Record<QueueItemType, { bg: string; text: string; label: string; border: string }> = {
  order:    { bg: C.brandSoft, text: C.brand, label: 'הזמנה', border: '#E7D1BE' },
  delivery: { bg: C.blueSoft,  text: C.blue,  label: 'משלוח', border: '#CADDE4' },
  payment:  { bg: C.amberSoft, text: C.amber, label: 'תשלום', border: '#E9CF9E' },
  stock:    { bg: C.redSoft,   text: C.red,   label: 'מלאי', border: '#E4C2BE' },
};
