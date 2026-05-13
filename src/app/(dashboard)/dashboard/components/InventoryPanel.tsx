'use client';

// "מלאי" — only items requiring attention (status ∈ {מלאי נמוך, קריטי,
// אזל מהמלאי}). Three column-grouped sections: חומרי גלם / מוצרים מוכנים /
// פטיפורים. Critical statuses bubble to the top within each group.

import Link from 'next/link';
import type { Stock, StockRow } from './types';

interface Props {
  stock: Stock;
  total: number;
}

const SEV_RANK: Record<string, number> = { 'אזל מהמלאי': 0, 'קריטי': 1, 'מלאי נמוך': 2 };

const TONE = (status: string) =>
  status === 'אזל מהמלאי' ? { chip: '#FEE4E2', text: '#991B1B', bar: '#C75F4D' }
  : status === 'קריטי'     ? { chip: '#FFEFD5', text: '#92400E', bar: '#D9A655' }
  :                          { chip: '#FBF1DC', text: '#92602A', bar: '#D9A655' };

export function InventoryPanel({ stock, total }: Props) {
  const sortRows = (arr: StockRow[]) => [...arr].sort((a, b) => (SEV_RANK[a.status] ?? 3) - (SEV_RANK[b.status] ?? 3));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>מלאי דורש טיפול</h2>
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: total > 0 ? '#FEE4E2' : '#DCFAE6', color: total > 0 ? '#991B1B' : '#0F766E' }}>
            {total}
          </span>
        </div>
        <Link href="/inventory" className="text-[11px] font-medium hover:underline" style={{ color: '#8A735F' }}>ניהול מלאי מלא →</Link>
      </header>

      {total === 0 ? (
        <div className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2' }}>
          <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: '#DCFAE6', color: '#0F766E' }}>✓</div>
          <p className="text-[14px] font-semibold" style={{ color: '#2B1A10' }}>כל המלאי בטווח התקין</p>
          <p className="text-[11.5px] mt-1" style={{ color: '#8A735F' }}>אין פריטים שדורשים השלמה כרגע</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Group title="חומרי גלם"      rows={sortRows(stock.raw)} />
          <Group title="מוצרים מוכנים" rows={sortRows(stock.products)} />
          <Group title="פטיפורים"      rows={sortRows(stock.petitFours)} />
        </div>
      )}
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: StockRow[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2', boxShadow: '0 1px 2px rgba(58,42,26,0.04)' }}>
      <header className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: '#FFFCF7', borderBottom: '1px solid #F0E7D8' }}>
        <h3 className="text-[12.5px] font-bold" style={{ color: '#2B1A10' }}>{title}</h3>
        <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: rows.length > 0 ? '#FEE4E2' : '#DCFAE6', color: rows.length > 0 ? '#991B1B' : '#0F766E' }}>{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="text-[11.5px] py-4 text-center" style={{ color: '#0F766E' }}>תקין</p>
      ) : (
        <ul>
          {rows.map((it, idx) => {
            const tone = TONE(it.status);
            const isLast = idx === rows.length - 1;
            return (
              <li
                key={it.id}
                className="flex items-stretch transition-colors hover:bg-amber-50/30"
                style={{ borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
              >
                <div style={{ width: 3, backgroundColor: tone.bar }} aria-hidden />
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5">
                  <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: '#2B1A10' }}>{it.שם}</span>
                  <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: '#8A735F' }}>{it.quantity}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: tone.chip, color: tone.text }}>{it.status}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
