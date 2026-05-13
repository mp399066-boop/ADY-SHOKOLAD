'use client';

// One row inside the daily work queue.
//
// Compact-by-default (May 2026 redesign):
//   - The default rendering is a single tight row: type badge, customer/title,
//     meta line, amount, primary action button, and a "פירוט" toggle.
//   - Clicking "פירוט" expands the *existing* status steppers (order /
//     payment / delivery) below the row. The steppers themselves are the
//     same components the page used before — none of the underlying status-
//     change handlers / API calls were touched.
//   - Urgency tone (`urgent_now`) tints the row with a soft red wash and
//     adds a subtle red badge. "Tone by status" stays restrained so the
//     dashboard reads like a boutique work board, not a traffic light.

import { useState } from 'react';
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
  const expandable = !!order || !!delivery;
  const [expanded, setExpanded] = useState(false);

  // Restrained per-row tinting. We only colour the row itself when something
  // is genuinely urgent or paid — neutrals otherwise so a wall of orders
  // doesn't look like a traffic-light.
  const rowBg = isUrgent
    ? '#FFF6F2'
    : (order?.סטטוס_תשלום === 'שולם' ? '#F6FAF4' : '#FFFFFF');
  const rowBorder = isUrgent ? '#E9C9C3' : C.borderSoft;

  return (
    <li
      onClick={() => handlers.onRowClick(item)}
      className="group cursor-pointer rounded-xl transition-colors"
      style={{
        backgroundColor: rowBg,
        border: `1px solid ${rowBorder}`,
        boxShadow: isUrgent
          ? '0 6px 14px rgba(157,75,74,0.07)'
          : '0 2px 8px rgba(47,27,20,0.035)',
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
      {/* ── Compact head row ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Left cluster: badges + title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
            >
              {tone.label}
            </span>
            {isUrgent && (
              <span
                className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: C.redSoft, color: C.red, border: '1px solid #E4C2BE' }}
              >
                דחוף
              </span>
            )}
            {order && (
              <StatusPill label={order.סטטוס_הזמנה} accent={C.brand} />
            )}
            {order && (
              <StatusPill
                label={order.סטטוס_תשלום}
                accent={order.סטטוס_תשלום === 'שולם' ? C.green : order.סטטוס_תשלום === 'ממתין' ? C.amber : C.textSoft}
              />
            )}
            {delivery && (
              <StatusPill
                label={delivery.סטטוס_משלוח}
                accent={delivery.סטטוס_משלוח === 'נמסר' ? C.green : C.blue}
              />
            )}
          </div>

          <div className="mt-1.5 flex items-baseline gap-2 min-w-0">
            <p className="text-[14px] font-bold truncate" style={{ color: C.text }}>
              {item.title}
            </p>
          </div>
          <p className="mt-0.5 text-[11px] truncate" style={{ color: C.textSoft }}>
            {item.meta}
          </p>
        </div>

        {/* Right cluster: amount + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {item.amount && (
            <span
              className="inline-flex items-center justify-center text-[12px] font-bold px-2 h-7 rounded-md tabular-nums"
              style={{ backgroundColor: C.card, color: C.text, border: `1px solid ${C.borderSoft}` }}
            >
              {item.amount}
            </span>
          )}
          <PrimaryActionButton
            label={item.action.label}
            urgent={isUrgent || item.type === 'delivery'}
            disabled={updating}
            onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
          />
          {expandable && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors"
              style={{
                backgroundColor: expanded ? C.brandSoft : '#FFFFFF',
                color: expanded ? C.brand : C.textSoft,
                border: `1px solid ${expanded ? '#E7D1BE' : C.borderSoft}`,
              }}
              title={expanded ? 'סגור פירוט' : 'פתח פירוט'}
              aria-label={expanded ? 'סגור פירוט' : 'פתח פירוט'}
              aria-expanded={expanded}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points={expanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded steppers (opt-in via "פירוט") ─────────────────────── */}
      {expanded && order && (
        <div
          className="grid gap-2 px-3 py-3"
          style={{ borderTop: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFCF8' }}
          onClick={(e) => e.stopPropagation()}
        >
          <ProgressField label="סטטוס הזמנה">
            <OrderStatusStepper
              current={order.סטטוס_הזמנה}
              disabled={updating}
              onChange={(next) => handlers.onChangeOrderStatus(order, next)}
            />
          </ProgressField>
          <ProgressField label="סטטוס תשלום">
            <PaymentStatusControl
              current={order.סטטוס_תשלום}
              disabled={updating}
              onChange={(next) => handlers.onChangePaymentStatus(order, next)}
            />
          </ProgressField>
        </div>
      )}

      {expanded && delivery && (
        <div
          className="px-3 py-2.5"
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
        </div>
      )}
    </li>
  );
}

// Small read-only status pill in the head row. Editable steppers live behind
// the "פירוט" toggle — this is the at-a-glance variant.
function StatusPill({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color: accent, backgroundColor: '#FFFFFF', border: `1px solid ${C.borderSoft}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
      {label}
    </span>
  );
}

function ProgressField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="min-w-0 rounded-lg px-3 py-2"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.borderSoft}` }}
    >
      <p className="mb-1.5 text-[10.5px] font-bold" style={{ color: C.textSoft }}>
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
      className="inline-flex items-center justify-center h-7 px-2.5 rounded-md text-[11.5px] font-bold whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-default"
      style={{
        backgroundColor: urgent ? C.espresso : C.brand,
        color: '#FFFFFF',
        border: `1px solid ${urgent ? C.espresso : C.brand}`,
        boxShadow: '0 3px 8px rgba(47,27,20,0.12)',
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
