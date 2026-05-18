'use client';

// Right-side rail. Kept deliberately small so the main board (WorkQueue)
// gets the most room. Two collapsible panels: quick navigation actions and
// a numeric alert summary that links into the full pages.

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

  const [openTasksCount, setOpenTasksCount] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/tasks?status=ממתין')
      .then(r => r.json())
      .then(json => setOpenTasksCount((json.data || []).length))
      .catch(() => setOpenTasksCount(0));
  }, []);

  return (
    <aside className="space-y-2.5">
      <Panel title="פעולות מהירות">
        <div className="grid grid-cols-2 gap-2">
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
          <QuickAction href="/employees" label="משימות">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
        <AlertLine
          label="משימות עובדים פתוחות"
          value={openTasksCount ?? 0}
          href="/employees"
          tone={(openTasksCount ?? 0) > 0 ? C.cocoa : C.green}
          loading={openTasksCount === null}
        />
      </Panel>
    </aside>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl p-2.5"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 4px 14px rgba(47,27,20,0.04)' }}
    >
      <h2 className="text-[12.5px] font-bold mb-2 px-0.5" style={{ color: C.textSoft, letterSpacing: '0.02em' }}>{title}</h2>
      {children}
    </section>
  );
}

function QuickAction({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg p-2 transition-all hover:-translate-y-px"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.text }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full transition-colors shrink-0"
        style={{ backgroundColor: C.brandSoft, color: C.brand }}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </span>
      <span className="text-[11.5px] font-bold truncate">{label}</span>
    </Link>
  );
}

function AlertLine({ label, value, href, tone, loading = false }: { label: string; value: number; href: string; tone: string; loading?: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 mb-1.5 last:mb-0 transition-colors"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
    >
      <span className="text-[11.5px] font-semibold truncate" style={{ color: C.text }}>{label}</span>
      <span
        className="inline-flex min-w-6 h-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
        style={{ color: loading ? C.textMuted : tone, backgroundColor: '#FFFFFF', border: `1px solid ${C.borderSoft}` }}
      >
        {loading ? '…' : value}
      </span>
    </Link>
  );
}
