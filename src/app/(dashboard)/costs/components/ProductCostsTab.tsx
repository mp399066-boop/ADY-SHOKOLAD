'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import {
  computeRowCost, marginPct, formatMinutes, salePriceBeforeVat, salePriceWithVat,
  type CatalogItem, type CostRawMaterial, type CostRecipe, type CostRow, type CostsData, type RowCost,
} from '@/lib/product-costs';
import { downloadExcel, type Cell } from '@/lib/finance-export';
import { matchesSearch, productSearchText } from '@/lib/normalize';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote, THEAD_STYLE, TOTAL_ROW_STYLE } from '../../finance/components/shared';
import CostFormModal from './CostFormModal';

type Filter = 'all' | 'missing' | 'recipe' | 'no_time';

const selectCls = 'px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function ProductCostsTab({ data, rawById, recipesById, reload, initialSearch }: {
  data: CostsData;
  rawById: Map<string, CostRawMaterial>;
  recipesById: Map<string, CostRecipe>;
  reload: () => void;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch ?? '');
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
    const salePrice = rowSalePrice(row, item);
    const price = Number(salePrice);
    // Profit per unit in ₪ — same basis as the % margin (sale price − unit cost).
    const profit = price > 0 && cost.total != null ? Math.round((price - cost.total) * 100) / 100 : null;
    return { row, cost, item, salePrice, margin: marginPct(salePrice, cost.total), profit };
  }), [data.rows, data.hourlyRate, recipesById, rawById, catalogByKey]);

  const visible = useMemo(() => {
    const q = search.trim();
    return computed.filter(({ row, cost, item }) => {
      const recipeNames = rowRecipeIds(row).map(id => recipesById.get(id)?.שם_מתכון ?? '').join(' ');
      if (q && !matchesSearch(`${productSearchText(row.שם, item?.sku)} ${row.גודל ?? ''} ${recipeNames}`, q)) return false;
      if (filter === 'missing') return !cost.complete;
      if (filter === 'recipe') return cost.materialsSource === 'recipe';
      if (filter === 'no_time') return !(Number(row.זמן_עבודה_דקות) > 0);
      return true;
    });
  }, [computed, search, filter, recipesById]);

  const stats = useMemo(() => ({
    total: computed.length,
    complete: computed.filter(c => c.cost.complete).length,
    byRecipe: computed.filter(c => c.cost.materialsSource === 'recipe').length,
    withTime: computed.filter(c => c.cost.laborSource === 'time').length,
  }), [computed]);

  // Most worth producing: highest ₪ profit per unit among products whose cost
  // is complete (partial costs would overstate the profit).
  const best = useMemo(() => {
    const ranked = computed
      .filter(c => c.cost.complete && c.profit != null)
      .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
    const byMargin = [...ranked].sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0];
    return { top: ranked[0], byMargin, count: ranked.length };
  }, [computed]);

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
    const header: Cell[] = ['שם המוצר', 'גודל', 'מוצר בקטלוג', 'עלות חומרים', 'מקור עלות החומרים', 'זמן עבודה (דקות)', 'ליחידות', 'עלות עבודה', 'מקור עלות העבודה', 'עלות ליחידה', 'מחיר מכירה לפני מע״מ', 'רווח ₪', 'רווח %', 'הערות'];
    const rows: Cell[][] = computed.map(({ row, cost, item, salePrice, margin, profit }) => [
      row.שם, row.גודל ?? '', item?.name ?? '',
      cost.materials, materialsSourceText(cost),
      row.זמן_עבודה_דקות, row.זמן_עבודה_דקות ? row.יחידות_בזמן_עבודה : null,
      cost.labor, laborSourceText(cost),
      cost.total, salePrice || null, profit, margin, row.הערות ?? '',
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
            value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם או קוד מוצר…"
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
        <div className="rounded-xl bg-white overflow-auto max-h-[calc(100vh-220px)]" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full">
            <thead className="sticky top-0 z-10" style={THEAD_STYLE}>
              <tr>
                <Th>מוצר</Th>
                <Th>עלות חומרים</Th>
                <Th>זמן עבודה</Th>
                <Th>עלות עבודה</Th>
                <Th>עלות ליחידה</Th>
                <Th>מחיר מכירה (לפני מע״מ)</Th>
                <Th>רווח</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row, cost, item, margin, profit }) => (
                <tr key={row.id} className="border-t hover:bg-[#FDFBF7] cursor-pointer" style={{ borderColor: C.border }} onClick={() => setEditing(row)}>
                  <Td>
                    <div className="font-medium">{row.שם}</div>
                    <div className="text-xs" style={{ color: C.faint }}>
                      {[row.גודל, item ? `${item.type === 'petit_four' ? 'פטיפור' : 'קטלוג'}: ${item.name}` : null, item?.sku].filter(Boolean).join(' · ') || ' '}
                    </div>
                    <RecipeLinks ids={rowRecipeIds(row)} recipesById={recipesById} />
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
                  <Td><SalePriceCell row={row} item={item} onSaved={reload} /></Td>
                  <Td>
                    {margin == null ? <span style={{ color: C.faint }}>—</span> : (
                      <div className="tabular-nums" style={{ color: margin >= 0 ? C.green : C.red }}>
                        <div className="font-semibold">{profit != null && profit < 0 ? '−' : ''}{money(Math.abs(profit ?? 0))}</div>
                        <div className="text-xs">{margin}%</div>
                      </div>
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
              <tr style={TOTAL_ROW_STYLE}>
                <td colSpan={8} className="px-4 py-3 text-sm" style={{ color: C.text }}>
                  {best.top ? (
                    <>
                      <span className="font-bold">⭐ הכי שווה לייצר: {best.top.row.שם}{best.top.row.גודל ? ` (${best.top.row.גודל})` : ''}</span>
                      {' — '}רווח של <b style={{ color: C.green }}>{money(best.top.profit ?? 0)}</b> ליחידה ({best.top.margin}%)
                      {best.byMargin && best.byMargin !== best.top && (
                        <span style={{ color: C.sub }}>
                          {' · '}אחוז הרווח הגבוה ביותר: {best.byMargin.row.שם}{best.byMargin.row.גודל ? ` (${best.byMargin.row.גודל})` : ''} — {best.byMargin.margin}% ({money(best.byMargin.profit ?? 0)})
                        </span>
                      )}
                      <div className="text-xs mt-0.5" style={{ color: C.sub }}>
                        לפי רווח בש״ח ליחידה (מחיר מכירה פחות עלות ליחידה), מתוך {best.count} מוצרים עם עלות מלאה ומחיר מכירה.
                      </div>
                    </>
                  ) : (
                    <span style={{ color: C.sub }}>כדי לדעת איזה מוצר הכי שווה לייצר — צריך מוצרים עם עלות מלאה ומחיר מכירה.</span>
                  )}
                </td>
              </tr>
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

/**
 * Sale price of a cost row, BEFORE VAT: a linked catalog product's retail
 * price (price list / base price — VAT included) less VAT, otherwise the
 * price entered on the row itself (unlinked rows and petit-fours, which have
 * no catalog price).
 */
function rowSalePrice(row: CostRow, item: CatalogItem | undefined): number | null {
  if (item?.type === 'sale_product') return salePriceBeforeVat(item.price);
  return row.מחיר_מכירה ?? null;
}

function SalePriceCell({ row, item, onSaved }: { row: CostRow; item: CatalogItem | undefined; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  // Enter saves and then the input blurs — the ref stops that second save.
  const busy = useRef(false);

  // A linked catalog product is priced in the catalog (and price list); any
  // other row keeps its own sale price on the cost row.
  const catalogProduct = item?.type === 'sale_product' ? item : null;
  const price = rowSalePrice(row, item);

  const start = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setValue(price ? String(price) : '');
    setEditing(true);
  };
  const save = async () => {
    if (busy.current) return;
    const n = Number(value);
    if (value.trim() === '' || n === Number(price ?? 0)) { setEditing(false); return; }
    if (!Number.isFinite(n) || n < 0) { toast.error('מחיר לא תקין'); return; }
    busy.current = true;
    setSaving(true);
    try {
      const url = catalogProduct ? `/api/costs/sale-price/${catalogProduct.id}` : `/api/costs/${row.id}/sale-price`;
      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ מחיר: n }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'עדכון המחיר נכשל');
      toast.success(`מחיר המכירה של "${catalogProduct?.name ?? row.שם}" עודכן`);
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון המחיר נכשל');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <span className="text-sm" style={{ color: C.sub }}>₪</span>
        <input
          autoFocus type="number" min={0} step={0.5} value={value} disabled={saving}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={save}
          aria-label="מחיר מכירה"
          className="w-20 px-2 py-1 text-sm rounded-md border border-[#C9A46A] bg-white tabular-nums focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button" onClick={start} title="לחצי לעדכון מחיר המכירה (לפני מע״מ)"
        className="tabular-nums rounded-md px-1.5 py-0.5 -mx-1.5 border border-dashed border-transparent hover:border-[#C9A46A]"
        style={{ color: price ? C.text : C.amber }}>
        {price ? money(price) : '+ מחיר'}
      </button>
      {price ? (
        <div className="text-xs tabular-nums" style={{ color: C.faint }}>
          כולל מע״מ {money(salePriceWithVat(price))}
        </div>
      ) : null}
    </div>
  );
}

/** The row's sub-recipes (migration 070), or its single recipe before that. */
function rowRecipeIds(row: CostRow): string[] {
  if (row.מתכונים?.length) return row.מתכונים.map(l => l.מתכון_id);
  return row.מתכון_id ? [row.מתכון_id] : [];
}

function RecipeLinks({ ids, recipesById }: { ids: string[]; recipesById: Map<string, CostRecipe> }) {
  const recipes = ids.map(id => recipesById.get(id)).filter((r): r is CostRecipe => !!r);
  if (!recipes.length) return null;
  if (recipes.length === 1) {
    return (
      <Link href={`/recipes?open=${recipes[0].id}`} onClick={e => e.stopPropagation()}
        className="text-xs underline" style={{ color: C.brand }}>
        למתכון ←
      </Link>
    );
  }
  return (
    <div className="text-xs" style={{ color: C.faint }}>
      {recipes.length} מתכונים:{' '}
      {recipes.map((r, i) => (
        <span key={r.id}>
          {i > 0 && ' · '}
          <Link href={`/recipes?open=${r.id}`} onClick={e => e.stopPropagation()} className="underline" style={{ color: C.brand }}>
            {r.שם_מתכון}
          </Link>
        </span>
      ))}
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
  const parts: string[] = [];
  if (cost.materialsSource === 'recipe') parts.push('לפי מתכון');
  else if (cost.materialsSource === 'manual') parts.push('ידני');
  // Direct raw materials (box, note card…) on top of the recipe / manual amount.
  if (cost.extraCount) parts.push(cost.materialsSource === 'items' ? `${cost.extraCount} חומרי גלם` : `+ ${cost.extraCount} חומרי גלם`);
  if (cost.recipeIssues) parts.push(`${cost.recipeIssues} רכיבים לא חושבו`);
  if (cost.recipeSuspicious) parts.push('מחיר חשוד');
  return parts.join(' · ');
}

function laborSourceText(cost: RowCost): string {
  if (cost.laborSource === 'time') return 'לפי זמן';
  if (cost.laborNeedsRate) return 'חסרה עלות שעה';
  if (cost.laborSource === 'manual') return 'ידני';
  return '';
}
