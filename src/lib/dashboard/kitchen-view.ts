import type { Delivery, Stock, StockRow, TodayOrder } from '@/app/(dashboard)/dashboard/components/types';

export type KitchenTabId = 'today' | 'prep' | 'payment' | 'delivery' | 'attention';
export type KitchenTaskType = 'הכנה' | 'תשלום' | 'משלוח' | 'מלאי';

export type KitchenTask = {
  id: string;
  order: TodayOrder;
  delivery: Delivery | null;
  type: KitchenTaskType;
  title: string;
  meta: string;
  dueLabel: string;
  needsAttention: boolean;
};

export type KitchenInventoryItem = StockRow & {
  kind: 'raw' | 'product' | 'petitFour';
  unit?: string | null;
};

export type KitchenAlert = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  action: 'inventory' | 'orders-unpaid' | 'deliveries' | 'system';
};

export type KitchenViewData = {
  kitchenTasks: KitchenTask[];
  tasksByTab: Record<KitchenTabId, KitchenTask[]>;
  inventoryWarnings: KitchenInventoryItem[];
  alerts: KitchenAlert[];
};

const ACTIVE_ORDER_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'];
const PREP_STATUSES = ['חדשה', 'בהכנה'];
const UNPAID_STATUSES = ['ממתין', 'חלקי'];
const ACTIVE_DELIVERY_STATUSES = ['ממתין', 'נאסף'];

function customerName(order: TodayOrder): string {
  if (order.שם_מקבל?.trim()) return order.שם_מקבל.trim();
  const c = order.לקוחות;
  return c ? `${c.שם_פרטי} ${c.שם_משפחה}`.trim() : 'לקוח';
}

function dueLabel(order: TodayOrder, todayISO: string): string {
  const date = order.תאריך_אספקה;
  const time = order.שעת_אספקה;
  if (!date) return time || 'ללא תאריך';
  if (date === todayISO) return time ? `היום ${time}` : 'היום';
  return time ? `${date} ${time}` : date;
}

function taskType(order: TodayOrder, delivery: Delivery | null): KitchenTaskType {
  if (UNPAID_STATUSES.includes(order.סטטוס_תשלום)) return 'תשלום';
  if (delivery && ACTIVE_DELIVERY_STATUSES.includes(delivery.סטטוס_משלוח)) return 'משלוח';
  if (PREP_STATUSES.includes(order.סטטוס_הזמנה)) return 'הכנה';
  return 'מלאי';
}

function uniqueOrders(orders: TodayOrder[]): TodayOrder[] {
  const seen = new Set<string>();
  return orders.filter(order => {
    if (seen.has(order.id)) return false;
    seen.add(order.id);
    return true;
  });
}

export function buildKitchenView({
  liveOrders,
  todayOrders,
  todayDeliveries,
  stock,
  todayISO,
}: {
  liveOrders: TodayOrder[];
  todayOrders: TodayOrder[];
  todayDeliveries: Delivery[];
  stock: Stock;
  todayISO: string;
}): KitchenViewData {
  const deliveryByOrderId = new Map<string, Delivery>();
  for (const delivery of todayDeliveries) {
    if (delivery.הזמנה_id) deliveryByOrderId.set(delivery.הזמנה_id, delivery);
  }

  const candidates = uniqueOrders([...todayOrders, ...liveOrders])
    .filter(order =>
      ACTIVE_ORDER_STATUSES.includes(order.סטטוס_הזמנה)
      || UNPAID_STATUSES.includes(order.סטטוס_תשלום)
      || deliveryByOrderId.has(order.id),
    );

  const kitchenTasks = candidates.map(order => {
    const delivery = deliveryByOrderId.get(order.id) ?? null;
    const type = taskType(order, delivery);
    const unpaid = UNPAID_STATUSES.includes(order.סטטוס_תשלום);
    const activeDelivery = !!delivery && ACTIVE_DELIVERY_STATUSES.includes(delivery.סטטוס_משלוח);
    const missingDate = !order.תאריך_אספקה;

    return {
      id: order.id,
      order,
      delivery,
      type,
      title: customerName(order),
      meta: `הזמנה #${order.מספר_הזמנה}`,
      dueLabel: dueLabel(order, todayISO),
      needsAttention: unpaid || activeDelivery || missingDate,
    };
  });

  const inventoryWarnings: KitchenInventoryItem[] = [
    ...stock.raw.map(item => ({ ...item, kind: 'raw' as const })),
    ...stock.products.map(item => ({ ...item, kind: 'product' as const })),
    ...stock.petitFours.map(item => ({ ...item, kind: 'petitFour' as const })),
  ].slice(0, 8);

  const unpaidCount = kitchenTasks.filter(task => UNPAID_STATUSES.includes(task.order.סטטוס_תשלום)).length;
  const deliveryCount = todayDeliveries.filter(d => ACTIVE_DELIVERY_STATUSES.includes(d.סטטוס_משלוח)).length;
  const lowStockCount = inventoryWarnings.length;

  const alerts: KitchenAlert[] = [
    ...(lowStockCount > 0 ? [{
      id: 'low-stock',
      title: `${lowStockCount} פריטי מלאי דורשים בדיקה`,
      description: 'חומרי גלם או מוצרים מתחת לסף.',
      actionLabel: 'פתח מלאי',
      action: 'inventory' as const,
    }] : []),
    ...(unpaidCount > 0 ? [{
      id: 'unpaid',
      title: `${unpaidCount} הזמנות ממתינות לתשלום`,
      description: 'אפשר לעדכן סטטוס ישירות מהשורות.',
      actionLabel: 'הצג',
      action: 'orders-unpaid' as const,
    }] : []),
    ...(deliveryCount > 0 ? [{
      id: 'deliveries',
      title: `${deliveryCount} משלוחים פתוחים להיום`,
      description: 'ממתינים או נאספו ועדיין לא נמסרו.',
      actionLabel: 'פתח משלוחים',
      action: 'deliveries' as const,
    }] : []),
  ];

  return {
    kitchenTasks,
    tasksByTab: {
      today: kitchenTasks,
      prep: kitchenTasks.filter(task => PREP_STATUSES.includes(task.order.סטטוס_הזמנה)),
      payment: kitchenTasks.filter(task => UNPAID_STATUSES.includes(task.order.סטטוס_תשלום)),
      delivery: kitchenTasks.filter(task => !!task.delivery && ACTIVE_DELIVERY_STATUSES.includes(task.delivery.סטטוס_משלוח)),
      attention: kitchenTasks.filter(task => task.needsAttention),
    },
    inventoryWarnings,
    alerts,
  };
}
