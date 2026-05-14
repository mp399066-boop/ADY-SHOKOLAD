'use client';

import { useMemo, useState } from 'react';
import type { KitchenAlert, KitchenTabId, KitchenViewData } from '@/lib/dashboard/kitchen-view';
import type { Delivery, TodayOrder } from './types';
import { KitchenAlerts } from './KitchenAlerts';
import { KitchenInventoryPanel } from './KitchenInventoryPanel';
import { KitchenQuickActions } from './KitchenQuickActions';
import { KitchenTaskRow } from './KitchenTaskRow';
import { C } from './theme';

type OrderStatus = TodayOrder['סטטוס_הזמנה'];
type PaymentStatus = TodayOrder['סטטוס_תשלום'];
type DeliveryStatus = 'ממתין' | 'נאסף' | 'נמסר';

const TABS: Array<{ id: KitchenTabId; label: string }> = [
  { id: 'attention', label: 'דורש טיפול' },
  { id: 'today', label: 'הכל להיום' },
  { id: 'prep', label: 'להכנה' },
  { id: 'payment', label: 'לתשלום' },
  { id: 'delivery', label: 'למשלוח' },
];

export function KitchenView({
  data,
  updatingId,
  onNavigate,
  onProduction,
  onOrderStatus,
  onPaymentStatus,
  onDeliveryStatus,
  onOpenOrder,
}: {
  data: KitchenViewData;
  updatingId: string | null;
  onNavigate: (path: string) => void;
  onProduction: () => void;
  onOrderStatus: (order: TodayOrder, status: OrderStatus) => void;
  onPaymentStatus: (order: TodayOrder, status: PaymentStatus) => void;
  onDeliveryStatus: (delivery: Delivery, status: DeliveryStatus) => void;
  onOpenOrder: (order: TodayOrder) => void;
}) {
  const defaultTab = data.tasksByTab.attention.length > 0 ? 'attention' : 'today';
  const [activeTab, setActiveTab] = useState<KitchenTabId>(defaultTab);
  const visibleTasks = useMemo(() => data.tasksByTab[activeTab] || [], [activeTab, data.tasksByTab]);

  function handleAlert(action: KitchenAlert['action']) {
    switch (action) {
      case 'inventory':
        onNavigate('/inventory');
        return;
      case 'orders-unpaid':
        onNavigate('/orders?filter=unpaid');
        return;
      case 'deliveries':
        onNavigate('/deliveries');
        return;
      case 'system':
        onNavigate('/settings/system-control');
        return;
    }
  }

  return (
    <div className="space-y-3">
      <KitchenQuickActions onNavigate={onNavigate} onProduction={onProduction} />

      <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: C.text }}>משימות תפעול להיום</h2>
            <p className="text-xs" style={{ color: C.textSoft }}>שורות קצרות, פעולה מהירה, בלי עומס.</p>
          </div>
          <div className="flex overflow-x-auto gap-1 pb-1">
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              const count = data.tasksByTab[tab.id]?.length ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="h-9 rounded-lg border px-3 text-xs font-bold whitespace-nowrap"
                  style={{
                    backgroundColor: active ? C.espresso : C.cardSoft,
                    borderColor: active ? C.espresso : C.border,
                    color: active ? '#FFFFFF' : C.text,
                  }}
                >
                  {tab.label} {count > 0 ? `(${count})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="rounded-lg border px-3 py-5 text-center text-sm font-semibold" style={{ borderColor: C.borderSoft, color: C.green, backgroundColor: C.greenSoft }}>
            אין משימות פתוחות בטאב הזה.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleTasks.map(task => (
              <KitchenTaskRow
                key={task.id}
                task={task}
                updating={updatingId === task.order.id || (!!task.delivery && updatingId === task.delivery.id)}
                onOrderStatus={onOrderStatus}
                onPaymentStatus={onPaymentStatus}
                onDeliveryStatus={onDeliveryStatus}
                onOpenOrder={onOpenOrder}
              />
            ))}
          </div>
        )}
      </section>

      <KitchenInventoryPanel items={data.inventoryWarnings} onOpenInventory={() => onNavigate('/inventory')} />
      <KitchenAlerts alerts={data.alerts} onAction={handleAlert} />
    </div>
  );
}
