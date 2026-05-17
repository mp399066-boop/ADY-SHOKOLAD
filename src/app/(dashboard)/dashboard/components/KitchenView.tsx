'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KitchenAlert, KitchenTabId, KitchenViewData } from '@/lib/dashboard/kitchen-view';
import type { KitchenPrepResponse } from '@/app/api/dashboard/kitchen-prep/route';
import type { Delivery, TodayOrder } from './types';
import { KitchenAlerts } from './KitchenAlerts';
import { KitchenInventoryPanel } from './KitchenInventoryPanel';
import { KitchenPrepBoard } from './KitchenPrepBoard';
import { KitchenQuickActions } from './KitchenQuickActions';
import { KitchenTaskRow } from './KitchenTaskRow';
import { C } from './theme';

type OrderStatus = TodayOrder['סטטוס_הזמנה'];
type PaymentStatus = TodayOrder['סטטוס_תשלום'];
type DeliveryStatus = 'ממתין' | 'נאסף' | 'נמסר';

// Payment tab removed from the kitchen view. The kitchen is a prep
// screen — payment chasing lives on the dedicated dashboard view.
const TABS: Array<{ id: KitchenTabId; label: string }> = [
  { id: 'attention', label: 'דורש טיפול' },
  { id: 'today',     label: 'הכל להיום'  },
  { id: 'prep',      label: 'להכנה'       },
  { id: 'delivery',  label: 'למשלוח'      },
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

  // Item-aggregated prep board — fetched once when the kitchen view
  // mounts. Kept separate from the dashboard's main fetch so a
  // backend hiccup on this query can't break the rest of the screen.
  const [prepData, setPrepData] = useState<KitchenPrepResponse | null>(null);
  const [prepLoading, setPrepLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setPrepLoading(true);
    fetch('/api/dashboard/kitchen-prep')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) setPrepData(j); })
      .catch(() => { if (!cancelled) setPrepData(null); })
      .finally(() => { if (!cancelled) setPrepLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function handleAlert(action: KitchenAlert['action']) {
    switch (action) {
      case 'inventory':
        onNavigate('/inventory');
        return;
      case 'orders-unpaid':
        // Kept for type compatibility; the kitchen no longer surfaces
        // this alert (see lib/dashboard/kitchen-view.ts). If the action
        // is ever triggered, route to the orders page as a safe default.
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
    <div className="space-y-2">
      <KitchenQuickActions onNavigate={onNavigate} onProduction={onProduction} />

      {/* The kitchen's most important answer: what to prepare, how much,
          by when, and whether stock covers it. Comes FIRST on the page. */}
      <KitchenPrepBoard data={prepData} loading={prepLoading} />

      {/* Inventory panels — finished goods + raw materials + petit-fours
          (already item-based; the panel groups by kind internally). */}
      <KitchenInventoryPanel items={data.inventoryWarnings} onOpenInventory={() => onNavigate('/inventory')} />

      {/* Order-level task list, demoted to a supporting role. Useful when
          the kitchen wants to mark a specific order as ready or jump into
          the full order card. */}
      <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
        <div className="mb-2 flex flex-col xl:flex-row xl:items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: C.text }}>הזמנות פעילות</h2>
            <p className="text-[11px]" style={{ color: C.textSoft }}>זמן יציאה, סטטוס ופעולה. ראשון בתור — קרוב ביותר ביציאה.</p>
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
                  className="h-7 rounded-md border px-2.5 text-[11px] font-bold whitespace-nowrap"
                  style={{
                    backgroundColor: active ? C.espresso : C.cardSoft,
                    borderColor: active ? C.espresso : C.border,
                    color: active ? '#FFFFFF' : C.textSoft,
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
          <div className="rounded-md border px-2" style={{ borderColor: C.borderSoft, backgroundColor: C.cardSoft }}>
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

      <KitchenAlerts alerts={data.alerts} onAction={handleAlert} />
    </div>
  );
}
