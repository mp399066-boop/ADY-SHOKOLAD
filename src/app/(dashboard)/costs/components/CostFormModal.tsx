'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  computeRowCost, recipeCost, marginPct, LINE_ISSUE_LABEL,
  type CostRawMaterial, type CostRecipe, type CostRow, type CostsData,
} from '@/lib/product-costs';
import { C, money } from '../../finance/components/shared';

const selectCls = 'w-full px-3 py-2 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

/** '' → null, otherwise a finite number (NaN when invalid). */
const parseNum = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export default function CostFormModal({ open, initial, data, rawById, recipesById, onClose, onSaved }: {
  open: boolean;
  /** Row to edit, or null for a new row. */
  initial: CostRow | null;
  data: CostsData;
  rawById: Map<string, CostRawMaterial>;
  recipesById: Map<string, CostRecipe>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [recipeId, setRecipeId] = useState('');
  const [useRecipe, setUseRecipe] = useState(false);
  const [manualMaterials, setManualMaterials] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [units, setUnits] = useState('1');
  const [manualLabor, setManualLabor] = useState('');
  const [notes, setNotes] = useState('');
  const [showLines, setShowLines] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = initial;
    setName(r?.שם ?? '');
    setSize(r?.גודל ?? '');
    setTargetKey(r?.סוג_יעד && r.יעד_id ? `${r.סוג_יעד}:${r.יעד_id}` : '');
    setRecipeId(r?.מתכון_id ?? '');
    setUseRecipe(!!r?.חומרים_לפי_מתכון);
    setManualMaterials(r?.עלות_חומרים_ידנית != null ? String(r.עלות_חומרים_ידנית) : '');
    const total = Number(r?.זמן_עבודה_דקות) || 0;
    setHours(total ? String(Math.floor(total / 60)) : '');
    setMinutes(total ? String(Math.round((total % 60) * 10) / 10) : '');
    setUnits(String(r?.יחידות_בזמן_עבודה ?? 1));
    setManualLabor(r?.עלות_עבודה_ידנית != null ? String(r.עלות_עבודה_ידנית) : '');
    setNotes(r?.הערות ?? '');
    setShowLines(false);
  }, [open, initial]);

  const products = useMemo(() => data.catalog.filter(c => c.type === 'sale_product' && (c.active || `${c.type}:${c.id}` === targetKey)), [data.catalog, targetKey]);
  const petitFours = useMemo(() => data.catalog.filter(c => c.type === 'petit_four' && (c.active || `${c.type}:${c.id}` === targetKey)), [data.catalog, targetKey]);
  const item = data.catalog.find(c => `${c.type}:${c.id}` === targetKey);

  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const recipe = recipeId ? recipesById.get(recipeId) : undefined;
  const rc = useMemo(() => (recipe ? recipeCost(recipe, rawById) : null), [recipe, rawById]);

  const preview = computeRowCost({
    מתכון_id: recipeId || null,
    חומרים_לפי_מתכון: useRecipe && !!recipeId,
    עלות_חומרים_ידנית: parseNum(manualMaterials),
    זמן_עבודה_דקות: totalMinutes > 0 ? totalMinutes : null,
    יחידות_בזמן_עבודה: Number(units) > 0 ? Number(units) : 1,
    עלות_עבודה_ידנית: parseNum(manualLabor),
  }, recipesById, rawById, data.hourlyRate);
  const margin = marginPct(item?.price, preview.total);

  // Linking a catalog item that has a recipe → suggest that recipe.
  const onTargetChange = (key: string) => {
    setTargetKey(key);
    if (recipeId || !key) return;
    const [type, id] = key.split(':');
    const match = data.recipes.find(r => r.production_target_type === type && r.production_target_id === id);
    if (match) setRecipeId(match.id);
    if (!name.trim()) {
      const c = data.catalog.find(x => `${x.type}:${x.id}` === key);
      if (c) setName(c.name);
    }
  };

  // Turn an Excel labor amount into minutes at the current hourly rate.
  const laborAsMinutes = data.hourlyRate && parseNum(manualLabor) ? (Number(manualLabor) / data.hourlyRate) * 60 : null;

  const save = async () => {
    if (!name.trim()) { toast.error('שם המוצר הוא שדה חובה'); return; }
    const nums = [parseNum(manualMaterials), parseNum(manualLabor), parseNum(hours), parseNum(minutes)];
    if (nums.some(n => n != null && (!Number.isFinite(n) || n < 0))) { toast.error('יש מספר לא תקין באחד השדות'); return; }
    if (!(Number(units) > 0)) { toast.error('מספר היחידות חייב להיות גדול מ-0'); return; }
    if (useRecipe && !recipeId) { toast.error('כדי לחשב לפי מתכון יש לבחור מתכון'); return; }

    const [type, id] = targetKey ? targetKey.split(':') : [null, null];
    const body = {
      שם: name.trim(),
      גודל: size.trim() || null,
      סוג_יעד: type,
      יעד_id: id,
      מתכון_id: recipeId || null,
      חומרים_לפי_מתכון: useRecipe && !!recipeId,
      עלות_חומרים_ידנית: parseNum(manualMaterials),
      זמן_עבודה_דקות: totalMinutes > 0 ? Math.round(totalMinutes * 100) / 100 : null,
      יחידות_בזמן_עבודה: Number(units),
      עלות_עבודה_ידנית: parseNum(manualLabor),
      הערות: notes.trim() || null,
    };
    setSaving(true);
    try {
      const res = await fetch(initial ? `/api/costs/${initial.id}` : '/api/costs', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'השמירה נכשלה');
      toast.success(initial ? 'העלות עודכנה' : 'המוצר נוסף לטבלת העלויות');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const sectionCls = 'rounded-xl p-4 space-y-3';
  const sectionStyle = { backgroundColor: C.soft, border: `1px solid ${C.border}` };
  const radio = (checked: boolean) => ({ color: checked ? C.brand : C.sub, fontWeight: checked ? 500 : 400 });

  return (
    <Modal open={open} onClose={onClose} title={initial ? `עלות מוצר — ${initial.שם}` : 'מוצר חדש בטבלת העלויות'} size="lg">
      <div className="space-y-4" dir="rtl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="שם המוצר" required value={name} onChange={e => setName(e.target.value)} maxLength={200} />
          <Input label="גודל" value={size} onChange={e => setSize(e.target.value)} placeholder="לדוגמה: קוטר 24" maxLength={100} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>מוצר בקטלוג (להצגת מחיר מכירה ורווח)</label>
          <select className={selectCls} value={targetKey} onChange={e => onTargetChange(e.target.value)}>
            <option value="">— לא מקושר —</option>
            <optgroup label="מוצרים">
              {products.map(p => <option key={p.id} value={`sale_product:${p.id}`}>{p.name}{p.price ? ` (${money(p.price)})` : ''}</option>)}
            </optgroup>
            <optgroup label="פטיפורים">
              {petitFours.map(p => <option key={p.id} value={`petit_four:${p.id}`}>{p.name}</option>)}
            </optgroup>
          </select>
        </div>

        {/* ── Materials ── */}
        <div className={sectionCls} style={sectionStyle}>
          <div className="text-sm font-semibold" style={{ color: C.text }}>עלות חומרים ליחידה</div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer" style={radio(!useRecipe)}>
              <input type="radio" checked={!useRecipe} onChange={() => setUseRecipe(false)} /> סכום ידני
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer" style={radio(useRecipe)}>
              <input type="radio" checked={useRecipe} onChange={() => setUseRecipe(true)} /> לפי מתכון (מתעדכן לפי מחירי חומרי הגלם)
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="עלות חומרים ידנית (₪ ליחידה)" type="number" min={0} step={0.01}
              value={manualMaterials} onChange={e => setManualMaterials(e.target.value)} disabled={useRecipe} />
            <div className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: C.sub }}>מתכון</label>
              <select className={selectCls} value={recipeId} onChange={e => setRecipeId(e.target.value)}>
                <option value="">— ללא מתכון —</option>
                {data.recipes.map(r => <option key={r.id} value={r.id}>{r.שם_מתכון} ({r.כמות_תוצר} {r.יחידת_תפוקה || 'יח׳'})</option>)}
              </select>
            </div>
          </div>
          {rc && (
            <div className="text-xs space-y-1.5" style={{ color: C.sub }}>
              <div>
                לפי המתכון: {money(rc.batchTotal)} לאצווה ÷ {rc.yield} יחידות = <b style={{ color: C.text }}>{money(Math.round(rc.perUnit * 100) / 100)} ליחידה</b>
                {rc.issues > 0 && <span style={{ color: C.amber }}> · {rc.issues} רכיבים לא חושבו (חסר מחיר / יחידות לא תואמות) — העלות חלקית</span>}
                {rc.lines.some(l => l.suspicious) && <span style={{ color: C.amber }}> · יש מחיר חשוד (מחיר לגרם/מ״ל גבוה מדי)</span>}
                {' '}
                <button type="button" className="underline" style={{ color: C.brand }} onClick={() => setShowLines(s => !s)}>
                  {showLines ? 'הסתרת פירוט' : 'פירוט רכיבים'}
                </button>
              </div>
              {showLines && (
                <div className="rounded-lg bg-white overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
                  <table className="w-full text-xs">
                    <tbody>
                      {rc.lines.map((l, i) => (
                        <tr key={i} className="border-t first:border-t-0" style={{ borderColor: C.border }}>
                          <td className="px-2 py-1" style={{ color: C.text }}>{l.name}</td>
                          <td className="px-2 py-1 tabular-nums whitespace-nowrap">{l.qty} {l.unit}</td>
                          <td className="px-2 py-1 whitespace-nowrap" style={l.suspicious ? { color: C.amber } : undefined}>
                            {l.price != null ? `${money(l.price)} ל-${l.materialUnit}` : ''}
                            {l.suspicious ? ' ⚠ מחיר חשוד' : ''}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap tabular-nums" style={{ color: l.issue ? C.amber : C.text }}>
                            {l.issue ? LINE_ISSUE_LABEL[l.issue] + (l.issue === 'unit_mismatch' ? ` (${l.unit} ↔ ${l.materialUnit})` : '') : money(Math.round((l.cost ?? 0) * 100) / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Labor ── */}
        <div className={sectionCls} style={sectionStyle}>
          <div className="text-sm font-semibold" style={{ color: C.text }}>זמן עבודה</div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="שעות" type="number" min={0} step={1} value={hours} onChange={e => setHours(e.target.value)} />
            <Input label="דקות" type="number" min={0} step={1} value={minutes} onChange={e => setMinutes(e.target.value)} />
            <Input label="כמה יחידות מייצרים בזמן הזה" type="number" min={1} step={1} value={units} onChange={e => setUnits(e.target.value)} />
          </div>
          <div className="text-xs" style={{ color: C.sub }}>
            {totalMinutes > 0 && data.hourlyRate
              ? <>עבודה: {money(data.hourlyRate)} לשעה × {Math.round(totalMinutes * 10) / 10} דקות ÷ {Number(units) || 1} יחידות = <b style={{ color: C.text }}>{money(preview.labor ?? 0)} ליחידה</b></>
              : totalMinutes > 0
                ? <span style={{ color: C.amber }}>כדי לחשב לפי זמן, יש להגדיר עלות שעת עבודה בראש העמוד.</span>
                : 'אפשר להזין זמן לאצווה שלמה (למשל 4 שעות ל-100 פטיפורים) או ליחידה אחת.'}
          </div>
          <Input label="עלות עבודה ידנית (₪ ליחידה) — בשימוש כשאין זמן עבודה" type="number" min={0} step={0.01}
            value={manualLabor} onChange={e => setManualLabor(e.target.value)} />
          {laborAsMinutes != null && totalMinutes === 0 && (
            <div className="text-xs" style={{ color: C.sub }}>
              לפי עלות שעה של {money(data.hourlyRate!)}, {money(Number(manualLabor))} עבודה ≈ {Math.round(laborAsMinutes * 10) / 10} דקות ליחידה.{' '}
              <button type="button" className="underline" style={{ color: C.brand }}
                onClick={() => { const m = Math.round(laborAsMinutes * 10) / 10; setHours(String(Math.floor(m / 60))); setMinutes(String(Math.round((m % 60) * 10) / 10)); setUnits('1'); }}>
                להעביר לזמן עבודה
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={1000}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]" />
        </div>

        {/* ── Live summary ── */}
        <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" style={{ border: `1px solid ${C.gold}` }}>
          <span style={{ color: C.sub }}>חומרים <b className="tabular-nums" style={{ color: C.text }}>{preview.materials == null ? '—' : money(preview.materials)}</b></span>
          <span style={{ color: C.sub }}>+ עבודה <b className="tabular-nums" style={{ color: C.text }}>{preview.labor == null ? '—' : money(preview.labor)}</b></span>
          <span style={{ color: C.sub }}>= עלות ליחידה <b className="tabular-nums text-base" style={{ color: C.brand }}>{preview.total == null ? '—' : money(preview.total)}</b></span>
          {item?.price ? (
            <span style={{ color: C.sub }}>
              מחיר מכירה {money(item.price)}
              {margin != null && <> · רווח <b style={{ color: margin >= 0 ? C.green : C.red }}>{margin}%</b></>}
            </span>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>ביטול</Button>
          <Button onClick={save} loading={saving}>שמירה</Button>
        </div>
      </div>
    </Modal>
  );
}
