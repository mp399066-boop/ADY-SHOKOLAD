'use client';

// Right-side intelligence rail. Quiet panel with the dashboard "snapshot" —
// not the work surface (that's WorkQueue). Three small cards stacked. The
// final "פעולות מהירות" block is a list of links to the rest of the system.

import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { AttentionCard } from './AttentionCard';
import { C } from './theme';
import type { Delivery, Stock, TodayOrder } from './types';

interface Props {
  liveOrders: TodayOrder[];
  todayDeliveries: Delivery[];
  stock: Stock;
  unpaidAmount: number;
  unpaidCount: number;
}

export function AttentionPanel({ liveOrders, todayDeliveries, stock, unpaidAmount, unpaidCount }: Props) {
  const allStock = [
    ...stock.raw.map(r => ({ ...r, kind: 'גלם' })),
    ...stock.products.map(r => ({ ...r, kind: 'מוצר' })),
    ...stock.petitFours.map(r => ({ ...r, kind: 'פטיפור' })),
  ];
  const SEV: Record<string, number> = { 'אזל מהמלאי': 0, 'קריטי': 1, 'מלאי נמוך': 2 };
  const criticalStock = allStock
    .filter(s => SEV[s.status] !== undefined)
    .sort((a, b) => (SEV[a.status] ?? 9) - (SEV[b.status] ?? 9));

  // Severity breakdown — surfaced in the stock card sub line so the user
  // gets a full count without having to scan the list.
  const outCount  = allStock.filter(s => s.status === 'אזל מהמלאי').length;
  const critCount = allStock.filter(s => s.status === 'קריטי').length;
  const lowCount  = allStock.filter(s => s.status === 'מלאי נמוך').length;
  const stockBreakdown = criticalStock.length === 0
    ? 'הכל בטווח התקין'
    : [outCount  ? `${outCount} אזלו`        : null,
       critCount ? `${critCount} קריטי`      : null,
       lowCount  ? `${lowCount} מתחת למינימום` : null]
        .filter(Boolean)
        .join(' · ');

  const openDeliveries = todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').length;

  // Unused for now but kept on the call site for future "X דחופות" surfacing
  void liveOrders;

  return (
    <aside className="space-y-3">
      <h2 className="text-[13px] font-bold tracking-tight" style={{ color: C.text, letterSpacing: '-0.005em' }}>
        דורש תשומת לב
      </h2>

      <AttentionCard
        label="מלאי דורש בדיקה"
        value={criticalStock.length}
        sub={stockBreakdown}
        accent={criticalStock.length > 0 ? C.red : C.green}
        rows={criticalStock.slice(0, 3).map(s => ({
          id: `${s.kind}-${s.id}`,
          primary: `${s.שם}`,
          secondary: `${s.kind} · ${s.status}`,
        }))}
        cta={criticalStock.length > 0 ? { label: 'פתח מלאי מלא', href: '/inventory' } : undefined}
      />

      <AttentionCard
        label="תשלומים פתוחים"
        value={formatCurrency(unpaidAmount)}
        sub={unpaidCount > 0 ? `${unpaidCount} הזמנות פתוחות` : 'כל ההזמנות שולמו'}
        accent={unpaidCount > 0 ? C.amber : C.green}
        cta={unpaidCount > 0 ? { label: 'פתח רשימת חייבים', href: '/orders?filter=unpaid' } : undefined}
      />

      <AttentionCard
        label="משלוחים שלא נסגרו"
        value={openDeliveries}
        sub={openDeliveries > 0 ? 'ממתינים לאיסוף או למסירה' : 'כל המשלוחים סגורים'}
        accent={openDeliveries > 0 ? C.blue : C.green}
        cta={openDeliveries > 0 ? { label: 'פתח משלוחים', href: '/deliveries' } : undefined}
      />

      {/* Static quick-link block — not dynamic, just navigation */}
      <div
        className="rounded-xl px-4 py-3.5"
        style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 1px 2px rgba(58,42,26,0.04)' }}
      >
        <p className="text-[10px] uppercase font-semibold mb-2.5" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          קיצורי דרך
        </p>
        <div className="grid gap-1">
          <QuickLink href="/orders"        label="כל ההזמנות" />
          <QuickLink href="/deliveries"    label="ניהול משלוחים" />
          <QuickLink href="/inventory"     label="ניהול מלאי" />
          <QuickLink href="/invoices"      label="חשבוניות וקבלות" />
          <QuickLink href="/customers"     label="לקוחות" />
        </div>
      </div>
    </aside>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors"
      style={{ color: C.text }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surface)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <span>{label}</span>
      <span style={{ color: C.textSoft }}>←</span>
    </Link>
  );
}
