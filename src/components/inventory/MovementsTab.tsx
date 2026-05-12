'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import type { InventoryMovement } from '@/types/database';

// Stock-movements ledger view. Reads from /api/inventory-movements
// (migration 025). Filters on item kind + movement direction + source +
// date range. Rows that originated in an order are clickable and deep-link
// to the order page.

const KIND_LABEL: Record<InventoryMovement['סוג_פריט'], string> = {
  'חומר_גלם': 'חומר גלם',
  'מוצר':     'מוצר מוגמר',
  'פטיפור':   'פטיפור',
};

const KIND_BADGE: Record<InventoryMovement['סוג_פריט'], { bg: string; fg: string }> = {
  'חומר_גלם': { bg: '#EFE4D3', fg: '#5C3410' },
  'מוצר':     { bg: '#DBEAFE', fg: '#1E40AF' },
  'פטיפור':   { bg: '#F3E8FF', fg: '#6D28D9' },
};

// Movement direction colors — green/red/amber as the user requested.
const MOVE_COLOR: Record<InventoryMovement['סוג_תנועה'], { bg: string; fg: string; arrow: string }> = {
  'כניסה':  { bg: '#DCFCE7', fg: '#166534', arrow: '↑' },
  'יציאה':  { bg: '#FEE2E2', fg: '#991B1B', arrow: '↓' },
  'התאמה':  { bg: '#FFEDD5', fg: '#9A3412', arrow: '⇄' },
};

const SOURCE_LABEL: Record<InventoryMovement['סוג_מקור'], string> = {
  'הזמנה':  'הזמנה',
  'ידני':   'ידני',
  'מערכת':  'מערכת',
};

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtNum(n: number): string {
  // Show up to 3 decimals only when needed; whole numbers stay clean.
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function MovementsTab() {
  const router = useRouter();
  const [rows, setRows] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters — kept in component state (URL-less; the inventory page already
  // owns the tab segment). Date range defaults to last 30 days.
  const [kindFilter, setKindFilter] = useState<string>('');
  const [moveFilter, setMoveFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (kindFilter) qs.set('itemKind', kindFilter);
    if (moveFilter) qs.set('movement', moveFilter);
    if (sourceFilter) qs.set('source', sourceFilter);
    qs.set('limit', '200');

    fetch(`/api/inventory-movements?${qs.toString()}`)
      .then(r => r.json())
      .then(({ data, error }) => {
        if (error) setError(error);
        else setRows((data as InventoryMovement[]) ?? []);
      })
      .catch(() => setError('שגיאה בטעינת תנועות מלאי'))
      .finally(() => setLoading(false));
  }, [kindFilter, moveFilter, sourceFilter]);

  // Client-side text search on item name.
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter(r => r.שם_פריט.includes(q));
  }, [rows, search]);

  const handleRowClick = (m: InventoryMovement) => {
    if (m.סוג_מקור === 'הזמנה' && m.מזהה_מקור) {
      router.push(`/orders/${m.מזהה_מקור}`);
    }
  };

  if (error) {
    return (
      <div className="rounded-xl border p-6 text-sm text-center" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}>
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="חיפוש לפי שם פריט"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
          style={{ borderColor: '#DDD0BC', color: '#2B1A10', minWidth: 200 }}
        />
        <select
          value={kindFilter}
          onChange={e => setKindFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
          style={{ borderColor: '#DDD0BC', color: '#6B4A2D' }}
        >
          <option value="">כל סוגי הפריטים</option>
          <option value="חומר_גלם">חומרי גלם</option>
          <option value="מוצר">מוצרים מוגמרים</option>
          <option value="פטיפור">פטיפורים</option>
        </select>
        <select
          value={moveFilter}
          onChange={e => setMoveFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
          style={{ borderColor: '#DDD0BC', color: '#6B4A2D' }}
        >
          <option value="">כל התנועות</option>
          <option value="כניסה">כניסה בלבד</option>
          <option value="יציאה">יציאה בלבד</option>
          <option value="התאמה">התאמה בלבד</option>
        </select>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
          style={{ borderColor: '#DDD0BC', color: '#6B4A2D' }}
        >
          <option value="">כל המקורות</option>
          <option value="הזמנה">הזמנה</option>
          <option value="ידני">ידני</option>
          <option value="מערכת">מערכת</option>
        </select>
        <span className="text-[11px] mr-auto" style={{ color: '#9B7A5A' }}>
          {loading ? 'טוען…' : `${filtered.length} תנועות`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
              {['תאריך', 'פריט', 'סוג', 'תנועה', 'כמות', 'לפני / אחרי', 'מקור', 'הערות'].map(h => (
                <th key={h} className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6B4A2D' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="py-12">
                  <EmptyState title="אין תנועות מלאי" description="כשתבוצענה הורדות מלאי או עדכונים — הם יופיעו כאן." />
                </td>
              </tr>
            ) : (
              filtered.map(m => {
                const moveColor = MOVE_COLOR[m.סוג_תנועה];
                const kindBadge = KIND_BADGE[m.סוג_פריט];
                const clickable = m.סוג_מקור === 'הזמנה' && !!m.מזהה_מקור;
                return (
                  <tr
                    key={m.id}
                    onClick={clickable ? () => handleRowClick(m) : undefined}
                    className={`border-b transition-colors ${clickable ? 'cursor-pointer hover:bg-amber-50' : ''}`}
                    style={{ borderColor: '#F5ECD8' }}
                    title={clickable ? 'לחצי לפתיחת ההזמנה' : undefined}
                  >
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: '#6B4A2D' }}>{fmtDateTime(m.תאריך_יצירה)}</td>
                    <td className="px-3 py-2 text-xs font-medium" style={{ color: '#2B1A10' }}>{m.שם_פריט || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: kindBadge.bg, color: kindBadge.fg }}>
                        {KIND_LABEL[m.סוג_פריט]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: moveColor.bg, color: moveColor.fg }}>
                        <span>{moveColor.arrow}</span>
                        <span>{m.סוג_תנועה}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold tabular-nums" style={{ color: moveColor.fg }}>
                      {fmtNum(Number(m.כמות))}
                    </td>
                    <td className="px-3 py-2 text-[11px] tabular-nums" style={{ color: '#6B4A2D' }}>
                      <span style={{ color: '#9B7A5A' }}>{fmtNum(Number(m.כמות_לפני))}</span>
                      <span className="mx-1.5" style={{ color: '#9B7A5A' }}>→</span>
                      <span style={{ color: '#2B1A10', fontWeight: 600 }}>{fmtNum(Number(m.כמות_אחרי))}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: '#6B4A2D' }}>
                      {SOURCE_LABEL[m.סוג_מקור]}
                      {clickable && (
                        <span className="ms-1 text-[10px]" style={{ color: '#8B5E34' }}>↗</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] max-w-xs truncate" style={{ color: '#6B4A2D' }} title={m.הערות || ''}>
                      {m.הערות || ''}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
