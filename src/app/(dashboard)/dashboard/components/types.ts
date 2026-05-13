// Shared types for the dashboard panel components. The page.tsx orchestrator
// owns state + handlers + modals; the panels are pure render/UI layers that
// receive everything they need via props. No data fetching, no writes.

import type { DashboardStats, Order } from '@/types/database';

export type TodayOrder = Order & {
  לקוחות?: { שם_פרטי: string; שם_משפחה: string };
  סוג_אספקה?: string;
  שעת_אספקה?: string | null;
  הערות_להזמנה?: string | null;
  אופן_תשלום?: string | null;
  שם_מקבל?: string | null;
  טלפון_מקבל?: string | null;
  itemSummary?: string | null;
};

export type Delivery = {
  id: string;
  הזמנה_id: string;
  סטטוס_משלוח: string;
  כתובת: string | null;
  עיר: string | null;
  שעת_משלוח: string | null;
  הזמנות?: {
    id: string;
    מספר_הזמנה: string;
    שם_מקבל: string | null;
    טלפון_מקבל: string | null;
    לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
  } | null;
  שליחים?: { שם_שליח: string } | null;
  _noRecord?: boolean;
};

export type StockRow = {
  id: string;
  שם: string;
  status: string;
  quantity: number;
};

// Tab IDs for the dashboard's primary navigation. The order matches the
// tabs row in DashboardTabs left-to-right (in RTL = visually right-to-left).
export type DashboardTab =
  | 'overview'    // הכל יחד — cross-cutting worklist
  | 'today'       // היום — today's orders + deliveries + critical stock
  | 'orders'      // הזמנות — active orders, table or kanban
  | 'deliveries'  // משלוחים — today's deliveries
  | 'payments'    // תשלומים — unpaid orders
  | 'inventory';  // מלאי — all low-stock items

export type Stock = { raw: StockRow[]; products: StockRow[]; petitFours: StockRow[] };

// Common props passed down from page.tsx to most panel components. Each panel
// destructures only the parts it needs.
export interface DashboardData {
  stats: DashboardStats | null;
  todayOrders: TodayOrder[];
  liveOrders: TodayOrder[];          // already filtered: not 'בוטלה' / 'טיוטה'
  todayDeliveries: Delivery[];
  stock: Stock;
  stockTotal: number;
  expectedRevenue: number;
}

export interface DashboardHandlers {
  updatingId: string | null;
  onAdvanceOrder: (o: TodayOrder) => void;
  onMarkPaid: (o: TodayOrder) => void;
  onOpenOrder: (o: TodayOrder) => void;
  onMoreActions: (o: TodayOrder) => void;
  onPatchDelivery: (d: Delivery, next: 'נאסף' | 'נמסר') => void;
  onOpenDelivery: (d: Delivery) => void;
}

export type Severity = 'red' | 'amber' | 'blue' | 'green';
