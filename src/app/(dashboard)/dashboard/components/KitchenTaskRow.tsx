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
        className="h-8 min-w-[86px] rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-60"
        style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.color }}
        title={label}
      >
        {value}
      </button>

      {open && (
        <div
          className="absolute left-0 top-10 z-30 w-[min(360px,calc(100vw-32px))] rounded-lg border p-3 shadow-lg"
          style={{ backgroundColor: C.card, borderColor: C.border }}
        >
          <div className="mb-2 text-right text-xs font-bold" style={{ color: C.textSoft }}>
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
                      className="absolute right-[calc(-50%+14px)] top-[11px] h-px w-[calc(100%-28px)]"
                      style={{ backgroundColor: index <= activeIndex ? C.gold : C.border }}
                    />
                  )}
                  <span
                    className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold"
                    style={{
                      backgroundColor: active ? statusColors.color : C.card,
                      borderColor: active ? statusColors.color : C.border,
                      color: active ? '#FFFFFF' : C.textSoft,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span
                    className="max-w-[74px] truncate text-[11px] font-bold leading-4"
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
      className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_auto] gap-2 border-b px-1 py-2.5 last:border-b-0"
      style={{ borderColor: C.borderSoft }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.needsAttention ? C.amber : C.border }} />
          <span className="truncate text-[15px] font-bold leading-6" style={{ color: C.text }}>{task.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pr-4 text-xs">
          <span className="font-mono" style={{ color: C.textSoft }}>{task.meta}</span>
          <span style={{ color: C.textMuted }}>·</span>
          <span className="font-semibold" style={{ color: C.cocoa }}>{task.dueLabel}</span>
          <span style={{ color: C.textMuted }}>·</span>
          <span className="font-bold" style={{ color: C.gold }}>{task.type}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          className="h-8 rounded-full border px-3 text-xs font-bold flex items-center gap-1.5"
          style={{ backgroundColor: C.card, borderColor: C.border, color: C.espresso }}
          title="פתח הזמנה מלאה"
        >
          <ExternalLink size={13} />
          פתח
        </button>
      </div>
    </div>
  );
}
