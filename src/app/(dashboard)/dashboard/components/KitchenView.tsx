'use client';

import { useEffect, useState } from 'react';
import type { KitchenAlert, KitchenTask, KitchenViewData } from '@/lib/dashboard/kitchen-view';
import type { KitchenPrepResponse } from '@/app/api/dashboard/kitchen-prep/route';
import type { Delivery, TodayOrder } from './types';
import { KitchenAlerts } from './KitchenAlerts';
import { KitchenInventoryPanel } from './KitchenInventoryPanel';
import { KitchenPrepBoard } from './KitchenPrepBoard';
import { KitchenQuickActions } from './KitchenQuickActions';
import { KitchenTaskRow } from './KitchenTaskRow';
import { C } from './theme';
import { RawMaterialsSummaryPanel } from '@/components/inventory/RawMaterialsSummaryPanel';

type OrderStatus = TodayOrder['סטטוס_הזמנה'];
type PaymentStatus = TodayOrder['סטטוס_תשלום'];
type DeliveryStatus = 'ממתין' | 'נאסף' | 'נמסר';

// ── 3-column kitchen kanban ───────────────────────────────────────────────────

const KANBAN_COLS = [
  {
    id: 'pending',
    label: 'ממתין להכנה',
    accent: C.amber,
    softBg: C.amberSoft,
    statuses: ['חדשה'],
  },
  {
    id: 'inprog',
    label: 'בעבודה',
    accent: C.brand,
    softBg: C.brandSoft,
    statuses: ['בהכנה'],
  },
  {
    id: 'done',
    label: 'מוכן / יצא',
    accent: C.green,
    softBg: C.greenSoft,
    statuses: ['מוכנה למשלוח', 'נשלחה'],
  },
] as const;

function KitchenKanban({
  tasks, updatingId, onOrderStatus, onPaymentStatus, onDeliveryStatus, onOpenOrder,
}: {
  tasks: KitchenTask[];
  updatingId: string | null;
  onOrderStatus: (order: TodayOrder, status: OrderStatus) => void;
  onPaymentStatus: (order: TodayOrder, status: PaymentStatus) => void;
  onDeliveryStatus: (delivery: Delivery, status: DeliveryStatus) => void;
  onOpenOrder: (order: TodayOrder) => void;
}) {
  const cols = KANBAN_COLS.map(col => ({
    ...col,
    items: tasks.filter(t => (col.statuses as readonly string[]).includes(t.order.סטטוס_הזמנה ?? '')),
  }));

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h2 className="text-[13px] font-bold" style={{ color: C.text }}>לוח עבודה</h2>
        <span className="text-[10.5px]" style={{ color: C.textMuted }}>
          {tasks.length} הזמנות פעילות
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {cols.map(col => (
          <div key={col.id}>
            {/* Column header */}
            <div
              className="flex items-center justify-between rounded-t-xl px-3 py-2"
              style={{ backgroundColor: col.softBg, border: `1px solid ${col.accent}20`, borderBottom: 'none' }}
            >
              <span className="text-[11.5px] font-bold" style={{ color: col.accent }}>{col.label}</span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${col.accent}22`, color: col.accent }}
              >
                {col.items.length}
              </span>
            </div>
            {/* Column body */}
            <div
              className="rounded-b-xl overflow-hidden"
              style={{ border: `1px solid ${C.border}`, borderTop: `1px solid ${col.accent}20` }}
            >
              {col.items.length === 0 ? (
                <div
                  className="px-3 py-5 text-center text-[11.5px] font-medium"
                  style={{ color: C.textMuted, backgroundColor: C.card }}
                >
                  ריק
                </div>
              ) : (
                <div
                  className="divide-y"
                  style={{ backgroundColor: C.card, borderColor: C.borderSoft }}
                >
                  {col.items.map(task => (
                    <KitchenTaskRow
                      key={task.id}
                      task={task}
                      updating={updatingId === task.order.id || (!!task.delivery && updatingId === task.delivery?.id)}
                      onOrderStatus={onOrderStatus}
                      onPaymentStatus={onPaymentStatus}
                      onDeliveryStatus={onDeliveryStatus}
                      onOpenOrder={onOpenOrder}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

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

      {/* Raw material requirements vs. active orders — compact view */}
      <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h2 className="text-sm font-bold" style={{ color: C.text }}>חוסרי חומרי גלם</h2>
            <p className="text-[11px]" style={{ color: C.textSoft }}>מול הזמנות פעילות השבוע</p>
          </div>
        </div>
        <RawMaterialsSummaryPanel mode="compact" />
      </section>

      {/* 3-column kanban: ממתין → בעבודה → הושלם */}
      <KitchenKanban
        tasks={data.tasksByTab.today}
        updatingId={updatingId}
        onOrderStatus={onOrderStatus}
        onPaymentStatus={onPaymentStatus}
        onDeliveryStatus={onDeliveryStatus}
        onOpenOrder={onOpenOrder}
      />

      <KitchenAlerts alerts={data.alerts} onAction={handleAlert} />
    </div>
  );
}
