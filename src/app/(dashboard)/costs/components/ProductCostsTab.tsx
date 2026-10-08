'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import {
  computeRowCost, marginPct, formatMinutes,
  type CostRawMaterial, type CostRecipe, type CostRow, type CostsData, type RowCost,
} from '@/lib/product-costs';
import { downloadExcel, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote } from '../../finance/components/shared';
import CostFormModal from './CostFormModal';

type Filter = 'all' | 'missing' | 'recipe' | 'no_time';

const selectCls = 'px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function ProductCostsTab({ data, rawById, recipesById, reload }: {
  data: CostsData;
  rawById: Map<string, CostRawMaterial>;
  recipesById: Map<string, CostRecipe>;
  reload: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<CostRow | null | 'new'>(null);
  const [toDelete, setToDelete] = useState<CostRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const catalogByKey = useMemo(
    () => new Map(data.catalog.map(c => [`${c.type}:${c.id}`, c])),
    [data.catalog],
  );

  const computed = useMemo(() => data.rows.map(row => {
    const cost = computeRowCost(row, recipesById, rawById, data.hourlyRate);
    const item = row.סוג_יעד && row.יעד_id ? catalogByKey.get(`${row.סוג_יעד}:${row.יעד_id}`) : undefined;
    return { row, cost, item, margin: marginPct(item?.price, cost.total) };
  }), [data.rows, data.hourlyRate, recipesById, rawById, catalogByKey]);

  const visible = useMemo(() => {
    const q = search.trim();
    return computed.filter(({ row, cost }) => {
      if (q && !`${row.שם} ${row.גודל ?? ''}`.includes(q)) return false;
      if (filter === 'missing') return !cost.complete;
      if (filter === 'recipe') return cost.materialsSource === 'recipe';
      if (filter === 'no_time') return !(Number(row.זמן_עבודה_דקות) > 0);
      return true;
    });
  }, [computed, search, filter]);

  const stats = useMemo(() => ({
    total: computed.length,
    complete: computed.filter(c => c.cost.complete).length,
    byRecipe: computed.filter(c => c.cost.materialsSource === 'recipe').length,
    withTime: computed.filter(c => c.cost.laborSource === 'time').length,
  }), [computed]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/costs/${toDelete.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'המחיקה נכשלה');
      toast.success('השורה נמחקה');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'המחיקה נכשלה');
    } finally {
      setDeleting(false);
    }
  };

  const exportExcel = async () => {
    const header: Cell[] = ['שם המוצר', 'גודל', 'מוצר בקטלוג', 'עלות חומרים', 'מקור עלות החומרים', 'זמן עבודה (דקות)', 'ליחידות', 'עלות עבודה', 'מקור עלות העבודה', 'עלות ליחידה', 'מחיר מכירה', 'רווח %', 'הערות'];
    const rows: Cell[][] = computed.map(({ row, cost, item, margin }) => [
      row.שם, row.גודל ?? '', item?.name ?? '',
      cost.materials, materialsSourceText(cost),
      row.זמן_עבודה_דקות, row.זמן_עבודה_דקות ? row.יחידות_בזמן_עבודה : null,
      cost.labor, laborSourceText(cost),
      cost.total, item?.price || null, margin, row.הערות ?? '',
    ]);
    const meta: Cell[][] = [[`עלות שעת עבודה: ${data.hourlyRate != null ? data.hourlyRate : 'לא הוגדרה'}`], []];
    await downloadExcel(`עלויות_מוצרים_${new Date().toISOString().slice(0, 10)}`, [{ name: 'עלויות מוצרים', rows: [...meta, header, ...rows] }]);
  };

  if (!data.tableReady) {
    return (
      <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.amberBg, color: C.amber }}>
        {data.hint}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="מוצרים בטבלה" value={String(stats.total)} />
        <StatCard label="עם עלות מלאה" value={String(stats.complete)} tone="green" sub="חומרים + עבודה" />
        <StatCard label="חסר מידע" value={String(stats.total - stats.complete)} tone={stats.total - stats.complete ? 'amber' : undefined} />
        <StatCard label="מחושבים לפי מתכון / זמן" value={`${stats.byRecipe} / ${stats.withTime}`} sub="מתעדכנים אוטומטית" />
      </div>

      {data.hourlyRate == null && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: C.amberBg, color: C.amber }}>
          כדי לחשב עלות עבודה לפי זמן ייצור — הגדירי למעלה את עלות שעת העבודה. עד אז מוצגת עלות העבודה שהוזנה ידנית (מהאקסל).
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מוצר…"
            className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A] w-44"
          />
          <select className={selectCls} value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="סינון">
            <option value="all">כל המוצרים</option>
            <option value="missing">חסר מידע</option>
            <option value="recipe">מחושבים לפי מתכון</option>
            <option value="no_time">בלי זמן עבודה</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons onExcel={exportExcel} />
          <button
            onClick={() => setEditing('new')}
            className="px-3 py-1.5 text-sm font-medium rounded-lg text-white" style={{ backgroundColor: C.brand }}>
            + מוצר חדש
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyNote>{computed.length === 0 ? 'עדיין אין מוצרים בטבלת העלויות.' : 'אין מוצרים שמתאימים לסינון.'}</EmptyNote>
      ) : (
        <div className="rounded-xl bg-white overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full">
            <thead style={{ backgroundColor: C.soft }}>
              <tr>
                <Th>מוצר</Th>
                <Th>עלות חומרים</Th>
                <Th>זמן עבודה</Th>
                <Th>עלות עבודה</Th>
                <Th>עלות ליחידה</Th>
                <Th>מחיר מכירה</Th>
                <Th>רווח</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row, cost, item, margin }) => (
                <tr key={row.id} className="border-t hover:bg-[#FDFBF7] cursor-pointer" style={{ borderColor: C.border }} onClick={() => setEditing(row)}>
                  <Td>
                    <div className="font-medium">{row.שם}</div>
                    <div className="text-xs" style={{ color: C.faint }}>
                      {[row.גודל, item ? `${item.type === 'petit_four' ? 'פטיפור' : 'קטלוג'}: ${item.name}` : null].filter(Boolean).join(' · ') || ' '}
                    </div>
                  </Td>
                  <Td>
                    <Amount value={cost.materials} />
                    <SourceNote text={materialsSourceText(cost)} warn={cost.recipeIssues > 0 || cost.recipeSuspicious > 0} />
                  </Td>
                  <Td>
                    <span className="tabular-nums">{formatMinutes(row.זמן_עבודה_דקות)}</span>
                    {Number(row.זמן_עבודה_דקות) > 0 && row.יחידות_בזמן_עבודה > 1 && (
                      <div className="text-xs" style={{ color: C.faint }}>ל-{row.יחידות_בזמן_עבודה} יחידות</div>
                    )}
                  </Td>
                  <Td>
                    <Amount value={cost.labor} />
                    <SourceNote text={laborSourceText(cost)} warn={cost.laborNeedsRate} />
                  </Td>
                  <Td>
                    <span className="font-semibold tabular-nums" style={{ color: cost.total == null ? C.faint : C.text }}>
                      {cost.total == null ? '—' : money(cost.total)}
                    </span>
                    {cost.total != null && !cost.complete && <div className="text-xs" style={{ color: C.amber }}>חלקי</div>}
                  </Td>
                  <Td><span className="tabular-nums">{item?.price ? money(item.price) : '—'}</span></Td>
                  <Td>
                    {margin == null ? <span style={{ color: C.faint }}>—</span> : (
                      <span className="tabular-nums font-medium" style={{ color: margin >= 0 ? C.green : C.red }}>{margin}%</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditing(row)} className="px-2 py-1 text-xs rounded-md" style={{ color: C.brand }}>עריכה</button>
                      <button onClick={() => setToDelete(row)} className="px-2 py-1 text-xs rounded-md" style={{ color: C.red }}>מחיקה</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CostFormModal
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        data={data}
        rawById={rawById}
        recipesById={recipesById}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="מחיקת מוצר מטבלת העלויות"
        description={toDelete ? `למחוק את "${toDelete.שם}" מטבלת העלויות? המוצר עצמו בקטלוג לא יימחק.` : ''}
        confirmLabel="מחיקה"
        loading={deleting}
      />
    </div>
  );
}

function Amount({ value }: { value: number | null }) {
  return <span className="tabular-nums" style={{ color: value == null ? C.faint : C.text }}>{value == null ? '—' : money(value)}</span>;
}

function SourceNote({ text, warn }: { text: string; warn?: boolean }) {
  if (!text) return null;
  return <div className="text-xs" style={{ color: warn ? C.amber : C.faint }}>{text}</div>;
}

function materialsSourceText(cost: RowCost): string {
  if (cost.materialsSource === 'recipe') {
    const parts = ['לפי מתכון'];
    if (cost.recipeIssues) parts.push(`${cost.recipeIssues} רכיבים לא חושבו`);
    if (cost.recipeSuspicious) parts.push('מחיר חשוד');
    return parts.join(' · ');
  }
  if (cost.materialsSource === 'manual') return 'ידני';
  return '';
}

function laborSourceText(cost: RowCost): string {
  if (cost.laborSource === 'time') return 'לפי זמן';
  if (cost.laborNeedsRate) return 'חסרה עלות שעה';
  if (cost.laborSource === 'manual') return 'ידני';
  return '';
}
