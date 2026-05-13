'use client';

import Link from 'next/link';
import { C } from './theme';
import type { Delivery, Stock, TodayOrder } from './types';

type PaymentStatus = 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר';
type DeliveryStatus = 'ממתין' | 'נאסף' | 'נמסר';

interface Props {
  liveOrders: TodayOrder[];
  todayDeliveries: Delivery[];
  stock: Stock;
  unpaidAmount: number;
  unpaidCount: number;
  updatingId: string | null;
  onChangePaymentStatus: (order: TodayOrder, next: PaymentStatus) => void;
  onPatchDelivery: (delivery: Delivery, next: DeliveryStatus) => void;
}

export function AttentionPanel({
  stock,
  unpaidCount,
  todayDeliveries,
}: Props) {
  const allStock = [
    ...stock.raw.map(r => ({ ...r, kind: 'חומר גלם' })),
    ...stock.products.map(r => ({ ...r, kind: 'מוצר' })),
    ...stock.petitFours.map(r => ({ ...r, kind: 'פטיפור' })),
  ];
  const alertCount = allStock.length;
  const activeDeliveries = todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').length;

  return (
    <aside className="space-y-4">
      <Panel title="פעולות מהירות">
        <div className="grid grid-cols-2 gap-3">
          <QuickAction href="/orders/new" label="הזמנה חדשה">
            <path d="M12 5v14M5 12h14" />
          </QuickAction>
          <QuickAction href="/customers/new" label="לקוח חדש">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </QuickAction>
          <QuickAction href="/inventory" label="מלאי">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.3 7 12 12l8.7-5" />
            <path d="M12 22V12" />
          </QuickAction>
          <QuickAction href="/invoices" label="חשבוניות">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8M8 17h5" />
          </QuickAction>
        </div>
      </Panel>

      <Panel title="התראות">
        <AlertLine
          label="תשלומים פתוחים"
          value={unpaidCount}
          href="/orders?filter=unpaid"
          tone={unpaidCount > 0 ? C.amber : C.green}
        />
        <AlertLine
          label="משלוחים פעילים"
          value={activeDeliveries}
          href="/deliveries"
          tone={activeDeliveries > 0 ? C.blue : C.green}
        />
        <AlertLine
          label="התראות מלאי"
          value={alertCount}
          href="/inventory"
          tone={alertCount > 0 ? C.red : C.green}
        />
      </Panel>
    </aside>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 10px 26px rgba(47,27,20,0.055)' }}
    >
      <h2 className="text-[16px] font-bold mb-4" style={{ color: C.text }}>{title}</h2>
      {children}
    </section>
  );
}

function QuickAction({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center gap-3 rounded-2xl p-4 text-center transition-all"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.text }}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full transition-colors"
        style={{ backgroundColor: C.brandSoft, color: C.brand }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </span>
      <span className="text-[13px] font-bold">{label}</span>
    </Link>
  );
}

function AlertLine({ label, value, href, tone }: { label: string; value: number; href: string; tone: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 mb-2 last:mb-0 transition-colors"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
    >
      <span className="text-[13px] font-semibold" style={{ color: C.text }}>{label}</span>
      <span
        className="inline-flex min-w-8 h-8 items-center justify-center rounded-full px-2 text-[13px] font-bold"
        style={{ color: tone, backgroundColor: '#FFFFFF', border: `1px solid ${C.borderSoft}` }}
      >
        {value}
      </span>
    </Link>
  );
}
