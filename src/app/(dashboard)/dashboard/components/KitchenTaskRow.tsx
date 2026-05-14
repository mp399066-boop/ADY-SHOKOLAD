'use client';

import { useState } from 'react';
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

function statusTone(value: string) {
  if (value === 'בוטלה' || value === 'בוטל') return { bg: C.redSoft, color: C.red, border: '#E4C2BE' };
  if (value === 'שולם' || value === 'הושלמה בהצלחה' || value === 'נמסר') return { bg: C.greenSoft, color: C.green, border: '#C9D9C7' };
  if (value === 'חלקי' || value === 'בהכנה' || value === 'נאסף') return { bg: C.amberSoft, color: C.amber, border: '#E7CFA9' };
  if (value === 'מוכנה למשלוח' || value === 'נשלחה') return { bg: C.blueSoft, color: C.blue, border: '#C5D7DE' };
  return { bg: C.brandSoft, color: C.text, border: C.border };
}

function StatusRail<T extends string>({
  value,
  options,
  label,
  disabled,
  onChange,
}: {
  value: T;
  options: T[];
  label: string;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const tone = statusTone(value);
  const activeIndex = Math.max(0, options.indexOf(value));

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(curr => !curr)}
        className="h-7 min-w-[74px] rounded-md border px-2 text-[11px] font-bold transition-colors disabled:cursor-default disabled:opacity-60"
        style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.color }}
        title={label}
      >
        {value}
      </button>

      {open && (
        <div
          className="absolute left-0 top-8 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border p-2.5 shadow-lg"
          style={{ backgroundColor: C.card, borderColor: C.border }}
        >
          <div className="mb-2 text-right text-[11px] font-bold" style={{ color: C.textSoft }}>
            {label}
          </div>
          <div className="flex items-start justify-between gap-1" dir="rtl">
            {options.map((status, index) => {
              const active = status === value;
              const statusColors = statusTone(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (status !== value) onChange(status);
                  }}
                  className="group relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
                  title={status}
                >
                  {index > 0 && (
                    <span
                      className="absolute right-[calc(-50%+12px)] top-[10px] h-px w-[calc(100%-24px)]"
                      style={{ backgroundColor: index <= activeIndex ? C.gold : C.border }}
                    />
                  )}
                  <span
                    className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold"
                    style={{
                      backgroundColor: active ? statusColors.color : C.card,
                      borderColor: active ? statusColors.color : C.border,
                      color: active ? '#FFFFFF' : C.textSoft,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span
                    className="max-w-[68px] truncate text-[10px] font-bold leading-3"
                    style={{ color: active ? statusColors.color : C.textSoft }}
                  >
                    {status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
      className="grid min-h-[54px] grid-cols-1 items-center gap-1 border-b px-1 py-1.5 last:border-b-0 lg:grid-cols-[minmax(320px,1fr)_auto]"
      style={{ borderColor: C.borderSoft }}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.needsAttention ? C.amber : C.border }} />
          <span className="truncate text-sm font-bold leading-5" style={{ color: C.text }}>{task.customerName}</span>
          {task.recipientName && (
            <span className="truncate text-[11px] font-semibold" style={{ color: C.textSoft }}>
              מקבל: {task.recipientName}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pr-3 text-[11px] leading-4">
          <span className="font-mono" style={{ color: C.textSoft }}>{task.meta.replace('הזמנה #', '')}</span>
          <span style={{ color: C.textMuted }}>·</span>
          <span className="font-semibold" style={{ color: C.cocoa }}>{task.dueLabel}</span>
          <span style={{ color: C.textMuted }}>·</span>
          <span className="font-bold" style={{ color: C.gold }}>{task.type}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusRail
          label="סטטוס הזמנה"
          value={task.order.סטטוס_הזמנה}
          options={ORDER_STATUSES}
          disabled={disabled}
          onChange={status => onOrderStatus(task.order, status)}
        />

        <StatusRail
          label="סטטוס תשלום"
          value={task.order.סטטוס_תשלום}
          options={PAYMENT_STATUSES}
          disabled={disabled}
          onChange={status => onPaymentStatus(task.order, status)}
        />

        {task.delivery && (
          <StatusRail
            label="סטטוס משלוח"
            value={task.delivery.סטטוס_משלוח as DeliveryStatus}
            options={DELIVERY_STATUSES}
            disabled={disabled}
            onChange={status => onDeliveryStatus(task.delivery!, status)}
          />
        )}

        <button
          type="button"
          onClick={() => onOpenOrder(task.order)}
          className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-bold"
          style={{ backgroundColor: C.card, borderColor: C.border, color: C.espresso }}
          title="פתח הזמנה מלאה"
        >
          <ExternalLink size={12} />
          פתח
        </button>
      </div>
    </div>
  );
}
