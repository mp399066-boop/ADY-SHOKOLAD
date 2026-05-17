'use client';

// "מה צריך להכין" — the central kitchen board.
//
// Item-aggregated demand across active upcoming orders. Sorted by
// earliest dispatch time. Each row shows: item name, total quantity,
// how many orders contributed, the earliest due time, and a
// preparation-availability badge from the stock cross-check that the
// server route already computed.
//
// Petit-four totals come pre-summed from the route (rolled up across
// all package selections), so the kitchen sees "Shoham × 15" once,
// not "Shoham × 5 in three different packages".
//
// No fake calculations: if availableStock is null on a bucket
// (server couldn't link the line to a stock row), we render an
// "unknown" badge instead of guessing.

import type { KitchenPrepResponse, PrepBucket } from '@/app/api/dashboard/kitchen-prep/route';
import { C } from './theme';

const STATUS_LABEL: Record<PrepBucket['status'], string> = {
  enough_stock:      'יש מספיק במלאי',
  partial_stock:     'מלאי חלקי — צריך להכין',
  needs_preparation: 'צריך להכין',
  missing_finished:  'חסר במלאי — להכין הכל',
  unknown:           'לא ניתן לחשב מלאי',
};

const STATUS_STYLE: Record<PrepBucket['status'], { bg: string; fg: string; border: string }> = {
  enough_stock:      { bg: C.greenSoft, fg: C.green, border: '#BFD4C2' },
  partial_stock:     { bg: C.amberSoft, fg: C.amber, border: '#E2C9A0' },
  needs_preparation: { bg: C.amberSoft, fg: C.amber, border: '#E2C9A0' },
  missing_finished:  { bg: C.redSoft,   fg: C.red,   border: '#E2B8B5' },
  unknown:           { bg: '#EEE7DC',   fg: C.textSoft, border: C.border },
};

const KIND_LABEL: Record<PrepBucket['kind'], string> = {
  package:    'מארזים',
  product:    'מוצרים',
  petitfour:  'פטיפורים',
};

function KindHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between px-2 py-1.5 mt-2 first:mt-0">
      <span className="text-[12px] font-bold tracking-wide" style={{ color: C.text }}>{label}</span>
      <span className="text-[10px]" style={{ color: C.textMuted }}>{count}</span>
    </div>
  );
}

function PrepRow({ b }: { b: PrepBucket }) {
  const style = STATUS_STYLE[b.status];
  return (
    <div
      className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2.5 border-t"
      style={{ borderColor: C.borderSoft }}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[14px] font-semibold truncate" style={{ color: C.text }}>{b.name}</span>
          <span className="text-[13px] font-bold tabular-nums" style={{ color: C.cocoa }}>× {b.totalDemand}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px]" style={{ color: C.textSoft }}>
          <span>{b.earliestDueLabel}</span>
          <span>·</span>
          <span>{b.orderCount} {b.orderCount === 1 ? 'הזמנה' : 'הזמנות'}</span>
          {b.availableStock !== null && (
            <>
              <span>·</span>
              <span>במלאי: {b.availableStock}</span>
            </>
          )}
          {b.shortfall !== null && b.shortfall > 0 && (
            <>
              <span>·</span>
              <span style={{ color: C.red, fontWeight: 600 }}>חסר {b.shortfall}</span>
            </>
          )}
        </div>
        {b.notes.length > 0 && (
          <div className="text-[11px] mt-0.5 truncate" style={{ color: C.textMuted }}>
            {b.notes.join(' · ')}
          </div>
        )}
      </div>
      <span
        className="self-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
        style={{ backgroundColor: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
      >
        {STATUS_LABEL[b.status]}
      </span>
    </div>
  );
}

export function KitchenPrepBoard({ data, loading }: { data: KitchenPrepResponse | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
        <div className="text-[12px]" style={{ color: C.textSoft }}>טוען רשימת הכנה…</div>
      </section>
    );
  }
  if (!data || data.buckets.length === 0) {
    return (
      <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
        <h2 className="text-base font-bold" style={{ color: C.text }}>מה צריך להכין</h2>
        <p className="text-[11px] mt-0.5" style={{ color: C.textSoft }}>אין הזמנות פעילות שדורשות הכנה בטווח של 14 הימים הקרובים.</p>
      </section>
    );
  }

  // Split into kind groups so the kitchen scans by category but the
  // global "earliest first" order is preserved within each group.
  const grouped = data.buckets.reduce<Record<PrepBucket['kind'], PrepBucket[]>>((acc, b) => {
    (acc[b.kind] ||= []).push(b);
    return acc;
  }, { package: [], product: [], petitfour: [] });

  return (
    <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: C.text }}>מה צריך להכין</h2>
          <p className="text-[11px]" style={{ color: C.textSoft }}>
            {data.ordersConsidered} הזמנות פעילות · 14 ימים קדימה · מוקדם ביותר ראשון
          </p>
        </div>
      </div>

      <div className="rounded-md border" style={{ borderColor: C.borderSoft, backgroundColor: C.cardSoft }}>
        {(['package', 'product', 'petitfour'] as const).map(kind => {
          const list = grouped[kind];
          if (!list || list.length === 0) return null;
          return (
            <div key={kind}>
              <KindHeader label={KIND_LABEL[kind]} count={list.length} />
              {list.map(b => <PrepRow key={b.key} b={b} />)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
