'use client';

import { C } from './theme';
import type { OrderStatusValue } from './OrderStatusStepper';
import type { PaymentStatusValue } from './PaymentStatusControl';
import type { QueueItem, QueueItemType } from './queue-builder';
import type { Delivery, TodayOrder } from './types';

export interface WorkQueueItemHandlers {
  onAction: (verb: QueueItem['action']['verb']) => void;
  onRowClick: (item: QueueItem) => void;
  onChangeOrderStatus: (order: TodayOrder, next: OrderStatusValue) => void;
  onChangePaymentStatus: (order: TodayOrder, next: PaymentStatusValue) => void;
  onChangeDeliveryStatus: (delivery: Delivery, next: 'ממתין' | 'נאסף' | 'נמסר') => void;
}

const ORDER_STATUSES: OrderStatusValue[] = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה'];
const PAYMENT_STATUSES: PaymentStatusValue[] = ['ממתין', 'חלקי', 'שולם', 'בוטל'];
const DELIVERY_STATUSES = ['ממתין', 'נאסף', 'נמסר'] as const;

export function WorkQueueItem({
  item, updating, handlers,
}: {
  item: QueueItem;
  updating: boolean;
  handlers: WorkQueueItemHandlers;
}) {
  const tone = TYPE_TONE[item.type];
  const isOrderRow = item.entity?.kind === 'order';
  const isDeliveryRow = item.entity?.kind === 'delivery';
  const isUrgent = item.urgency === 'urgent_now';
  const order = item.entity?.kind === 'order' ? item.entity.data : null;
  const delivery = item.entity?.kind === 'delivery' ? item.entity.data : null;

  return (
    <li
      onClick={() => handlers.onRowClick(item)}
      className="group cursor-pointer rounded-2xl transition-all"
      style={{
        backgroundColor: isUrgent ? '#FFF7F4' : '#FFFFFF',
        border: `1px solid ${isUrgent ? '#E9C9C3' : C.borderSoft}`,
        boxShadow: isUrgent ? '0 12px 28px rgba(157,75,74,0.10)' : '0 8px 22px rgba(47,27,20,0.05)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = isUrgent ? '0 16px 34px rgba(157,75,74,0.14)' : '0 12px 28px rgba(47,27,20,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = isUrgent ? '0 12px 28px rgba(157,75,74,0.10)' : '0 8px 22px rgba(47,27,20,0.05)';
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
      <div className="grid gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center justify-center text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
              style={{ backgroundColor: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
            >
              {tone.label}
            </span>
            {isUrgent && (
              <span
                className="inline-flex items-center justify-center text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
                style={{ backgroundColor: C.redSoft, color: C.red, border: '1px solid #E4C2BE' }}
              >
                דחוף
              </span>
            )}
            {item.amount && (
              <span
                className="inline-flex items-center justify-center text-[13px] font-bold px-3 py-1.5 rounded-lg tabular-nums"
                style={{ backgroundColor: C.card, color: C.text, border: `1px solid ${C.borderSoft}` }}
              >
                {item.amount}
              </span>
            )}
          </div>

          <p className="mt-3 text-[17px] font-bold truncate" style={{ color: C.text, letterSpacing: 0 }}>
            {item.title}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 line-clamp-2" style={{ color: C.textSoft }}>
            {item.meta}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          {!isOrderRow && !delivery && (
            <PrimaryActionButton
              label={item.action.label}
              urgent={isUrgent || isDeliveryRow}
              disabled={updating}
              onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
            />
          )}
        </div>
      </div>

      {order && (
        <div
          className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] items-end"
          style={{ borderTop: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFCF8' }}
          onClick={(e) => e.stopPropagation()}
        >
          <FieldSelect
            label="סטטוס הזמנה"
            value={order.סטטוס_הזמנה}
            options={ORDER_STATUSES}
            disabled={updating}
            onChange={(next) => handlers.onChangeOrderStatus(order, next as OrderStatusValue)}
          />
          <FieldSelect
            label="סטטוס תשלום"
            value={order.סטטוס_תשלום}
            options={PAYMENT_STATUSES}
            disabled={updating}
            onChange={(next) => handlers.onChangePaymentStatus(order, next as PaymentStatusValue)}
          />
          <PrimaryActionButton
            label={item.action.label}
            urgent={isUrgent}
            disabled={updating}
            onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
          />
        </div>
      )}

      {delivery && (
        <div
          className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] items-end"
          style={{ borderTop: `1px solid ${C.borderSoft}`, backgroundColor: '#FFFCF8' }}
          onClick={(e) => e.stopPropagation()}
        >
          <FieldSelect
            label="סטטוס משלוח"
            value={delivery.סטטוס_משלוח}
            options={DELIVERY_STATUSES}
            disabled={updating}
            onChange={(next) => handlers.onChangeDeliveryStatus(delivery, next as 'ממתין' | 'נאסף' | 'נמסר')}
          />
          <PrimaryActionButton
            label={item.action.label}
            urgent={isUrgent || isDeliveryRow}
            disabled={updating}
            onClick={(e) => { e.stopPropagation(); handlers.onAction(item.action.verb); }}
          />
        </div>
      )}
    </li>
  );
}

function FieldSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-bold mb-1.5" style={{ color: C.textSoft }}>
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (e.target.value !== value) onChange(e.target.value);
        }}
        className="w-full h-10 rounded-xl px-3 text-[13px] font-semibold outline-none disabled:opacity-60 disabled:cursor-wait"
        style={{
          backgroundColor: '#FFFFFF',
          color: C.text,
          border: `1px solid ${C.border}`,
          boxShadow: '0 4px 12px rgba(47,27,20,0.04)',
        }}
      >
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
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
      className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-[13px] font-bold whitespace-nowrap transition-all disabled:opacity-60 disabled:cursor-default"
      style={{
        backgroundColor: urgent ? C.espresso : C.brand,
        color: '#FFFFFF',
        border: `1px solid ${urgent ? C.espresso : C.brand}`,
        boxShadow: '0 8px 18px rgba(47,27,20,0.16)',
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
