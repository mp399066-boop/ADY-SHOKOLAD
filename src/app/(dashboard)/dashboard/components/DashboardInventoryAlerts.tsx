'use client';

import Link from 'next/link';
import { C } from './theme';
import type { Stock, StockRow } from './types';
import type { StockItemRef } from '@/components/inventory/StockItemEditor';

const SEVERITY_ORDER: Record<string, number> = {
  'אזל מהמלאי': 0,
  'קריטי': 1,
  'מלאי נמוך': 2,
};

function sortBySeverity(rows: StockRow[]): StockRow[] {
  return [...rows].sort((a, b) => (SEVERITY_ORDER[a.status] ?? 9) - (SEVERITY_ORDER[b.status] ?? 9));
}

function severityColor(status: string): string {
  if (status === 'אזל מהמלאי') return C.red;
  if (status === 'קריטי') return '#C05621';
  return C.amber;
}

function severityLabel(status: string): string {
  if (status === 'אזל מהמלאי') return 'אזל';
  if (status === 'קריטי') return 'קריטי';
  return 'נמוך';
}

function AlertRow({ row, isLast, onEdit }: { row: StockRow; isLast: boolean; onEdit?: () => void }) {
  const color = severityColor(row.status);
  return (
    <div
      className={`flex items-center gap-2 py-1.5${onEdit ? ' cursor-pointer hover:bg-[#FBF6EE] rounded' : ''}`}
      style={isLast ? undefined : { borderBottom: `1px solid ${C.borderSoft}` }}
      onClick={onEdit}
      title={onEdit ? 'לחצי לעריכה' : undefined}
      role={onEdit ? 'button' : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 text-[12px] font-medium truncate" style={{ color: C.text }}>{row.שם}</span>
      <span className="text-[10.5px] font-bold flex-shrink-0" style={{ color }}>
        {severityLabel(row.status)}
      </span>
    </div>
  );
}

export function DashboardInventoryAlerts({ stock, onEdit }: { stock: Stock; onEdit?: (ref: StockItemRef) => void }) {
  const productIds = new Set(stock.products.map(p => p.id));
  const finishedGoods = sortBySeverity([...stock.products, ...stock.petitFours]).slice(0, 3);
  const rawMats = sortBySeverity(stock.raw).slice(0, 3);
  const totalAlerts = stock.products.length + stock.petitFours.length + stock.raw.length;

  if (totalAlerts === 0) return null;

  return (
    <section
      className="rounded-xl p-3"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 4px 14px rgba(47,27,20,0.04)' }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[12.5px] font-bold" style={{ color: C.textSoft }}>התראות מלאי</h2>
        <span
          className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: C.redSoft, color: C.red }}
        >
          {totalAlerts}
        </span>
      </div>

      {finishedGoods.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>
            מוצרים ופטיפורים
          </p>
          {finishedGoods.map((r, i) => (
            <AlertRow
              key={`p-${r.id}`} row={r} isLast={i === finishedGoods.length - 1}
              onEdit={onEdit ? () => onEdit({ kind: productIds.has(r.id) ? 'product' : 'petitFour', id: r.id }) : undefined}
            />
          ))}
        </div>
      )}

      {rawMats.length > 0 && (
        <div className="mb-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.textMuted }}>
            חומרי גלם
          </p>
          {rawMats.map((r, i) => (
            <AlertRow
              key={`r-${r.id}`} row={r} isLast={i === rawMats.length - 1}
              onEdit={onEdit ? () => onEdit({ kind: 'raw', id: r.id }) : undefined}
            />
          ))}
        </div>
      )}

      <Link
        href="/inventory"
        className="flex items-center justify-center gap-1 pt-1 text-[11.5px] font-semibold transition-opacity hover:opacity-70"
        style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
      >
        כל {totalAlerts} ההתראות ←
      </Link>
    </section>
  );
}
