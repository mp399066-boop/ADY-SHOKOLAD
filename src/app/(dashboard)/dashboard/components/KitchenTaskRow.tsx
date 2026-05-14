'use client';

import { ExternalLink } from 'lucide-react';
import type { KitchenTask } from '@/lib/dashboard/kitchen-view';
import type { Delivery, TodayOrder } from './types';
import { C } from './theme';

type OrderStatus = TodayOrder['סטטוס_הזמנה'];
type PaymentStatus = TodayOrder['סטטוס_תשלום'];
type DeliveryStatus = 'ממתין' | 'נאסף' | 'נמסר';

const ORDER_STATUSES: OrderStatus[] = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה'];
const PAYMENT_STATUSES: PaymentStatus[] = ['ממתין', 'שולם', 'חלקי', 'בוטל'];
const DELIVERY_STATUSES: DeliveryStatus[] = ['ממתין', 'נאסף', 'נמסר'];

export function KitchenTaskRow({
  task,
  updating,
  onOrderStatus,
  onPaymentStatus,
  onDeliveryStatus,
  onOpenOrder,
}: {
  task: KitchenTask;
  updating: boolean;
  onOrderStatus: (order: TodayOrder, status: OrderStatus) => void;
  onPaymentStatus: (order: TodayOrder, status: PaymentStatus) => void;
  onDeliveryStatus: (delivery: Delivery, status: DeliveryStatus) => void;
  onOpenOrder: (order: TodayOrder) => void;
}) {
  const disabled = updating;

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[minmax(180px,1fr)_auto] gap-2 rounded-lg border px-3 py-2"
      style={{ backgroundColor: C.card, borderColor: task.needsAttention ? C.gold : C.border }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-bold truncate" style={{ color: C.text }}>{task.title}</span>
          <span style={{ color: C.textMuted }}>·</span>
          <span className="font-mono text-xs" style={{ color: C.textSoft }}>{task.meta}</span>
          <span style={{ color: C.textMuted }}>·</span>
          <span className="text-xs font-semibold" style={{ color: C.cocoa }}>{task.dueLabel}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: C.goldSoft, color: C.espresso }}
          >
            {task.type}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="סטטוס הזמנה"
          value={task.order.סטטוס_הזמנה}
          disabled={disabled}
          onChange={event => onOrderStatus(task.order, event.target.value as OrderStatus)}
          className="h-9 min-w-[132px] rounded-lg border px-2 text-xs font-semibold outline-none disabled:opacity-60"
          style={{ backgroundColor: C.brandSoft, borderColor: C.border, color: C.text }}
        >
          {ORDER_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
        </select>

        <select
          aria-label="סטטוס תשלום"
          value={task.order.סטטוס_תשלום}
          disabled={disabled}
          onChange={event => onPaymentStatus(task.order, event.target.value as PaymentStatus)}
          className="h-9 min-w-[100px] rounded-lg border px-2 text-xs font-semibold outline-none disabled:opacity-60"
          style={{ backgroundColor: C.cardSoft, borderColor: C.border, color: C.text }}
        >
          {PAYMENT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
        </select>

        {task.delivery && (
          <select
            aria-label="סטטוס משלוח"
            value={task.delivery.סטטוס_משלוח as DeliveryStatus}
            disabled={disabled}
            onChange={event => onDeliveryStatus(task.delivery!, event.target.value as DeliveryStatus)}
            className="h-9 min-w-[96px] rounded-lg border px-2 text-xs font-semibold outline-none disabled:opacity-60"
            style={{ backgroundColor: C.cardSoft, borderColor: C.border, color: C.text }}
          >
            {DELIVERY_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        )}

        <button
          type="button"
          onClick={() => onOpenOrder(task.order)}
          className="h-9 rounded-lg border px-3 text-xs font-bold flex items-center gap-1.5"
          style={{ backgroundColor: C.espresso, borderColor: C.espresso, color: '#FFFFFF' }}
          title="פתח הזמנה מלאה"
        >
          <ExternalLink size={14} />
          פתח
        </button>
      </div>
    </div>
  );
}
