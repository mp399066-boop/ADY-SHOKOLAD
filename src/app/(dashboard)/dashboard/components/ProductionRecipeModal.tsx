'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import type { RawMaterial, Recipe } from '@/types/database';
import { C } from './theme';

type PreviewRow = {
  id: string;
  name: string;
  unit: string;
  required: number;
  current: number;
  remaining: number;
  missing: boolean;
};

export function ProductionRecipeModal({
  open,
  recipes,
  rawMaterials,
  onClose,
  onDone,
}: {
  open: boolean;
  recipes: Recipe[];
  rawMaterials: RawMaterial[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [recipeId, setRecipeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  const selectedRecipe = useMemo(
    () => recipes.find(recipe => recipe.id === recipeId) ?? null,
    [recipeId, recipes],
  );

  const rawById = useMemo(() => new Map(rawMaterials.map(item => [item.id, item])), [rawMaterials]);
  const amount = Math.max(0, Number(quantity) || 0);
  const multiplier = selectedRecipe ? amount / (Number(selectedRecipe.כמות_תוצר) || 1) : 0;

  const previewRows: PreviewRow[] = useMemo(() => {
    if (!selectedRecipe) return [];
    return (selectedRecipe.רכיבי_מתכון || []).map(ingredient => {
      const material = rawById.get(ingredient.חומר_גלם_id);
      const current = Number(material?.כמות_במלאי ?? 0);
      const required = Number(ingredient.כמות_נדרשת || 0) * multiplier;
      return {
        id: ingredient.id,
        name: material?.שם_חומר_גלם || ingredient.מלאי_חומרי_גלם?.שם_חומר_גלם || 'חומר גלם',
        unit: material?.יחידת_מידה || ingredient.יחידת_מידה || ingredient.מלאי_חומרי_גלם?.יחידת_מידה || '',
        required,
        current,
        remaining: current - required,
        missing: current < required,
      };
    });
  }, [multiplier, rawById, selectedRecipe]);

  const hasMissing = previewRows.some(row => row.missing);
  const canSubmit = !!selectedRecipe?.מוצר_id && amount > 0 && previewRows.length > 0 && !submitting;

  async function confirmProduction() {
    if (!selectedRecipe?.מוצר_id || amount <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          מוצר_id: selectedRecipe.מוצר_id,
          כמות_שיוצרה: amount,
          הערות: `ייצור לפי מתכון: ${selectedRecipe.שם_מתכון}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'שגיאה בייצור לפי מתכון');
        return;
      }
      toast.success('הייצור נרשם והמלאי עודכן');
      onDone();
      onClose();
    } catch {
      toast.error('שגיאת רשת בייצור לפי מתכון');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ייצור לפי מתכון" size="lg">
      <div className="space-y-4" dir="rtl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold" style={{ color: C.textSoft }}>מתכון</span>
            <select
              value={recipeId}
              onChange={event => setRecipeId(event.target.value)}
              className="h-11 w-full rounded-lg border px-3 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.card, color: C.text }}
            >
              <option value="">בחירת מתכון</option>
              {recipes.map(recipe => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.שם_מתכון}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold" style={{ color: C.textSoft }}>כמות לייצור</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={event => setQuantity(event.target.value)}
              className="h-11 w-full rounded-lg border px-3 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.card, color: C.text }}
            />
          </label>
        </div>

        {selectedRecipe && !selectedRecipe.מוצר_id && (
          <div className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.border, color: C.amber, backgroundColor: C.amberSoft }}>
            למתכון הזה אין מוצר מקושר, ולכן אי אפשר להריץ ייצור דרך API הייצור הקיים.
          </div>
        )}

        {hasMissing && (
          <div className="rounded-lg border px-3 py-2 text-sm font-bold" style={{ borderColor: '#E4C2BE', color: C.red, backgroundColor: C.redSoft }}>
            יש חומרי גלם שלא מספיקים לייצור הכמות הזו.
          </div>
        )}

        <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
          <div className="grid grid-cols-5 gap-2 px-3 py-2 text-[11px] font-bold" style={{ backgroundColor: C.brandSoft, color: C.textSoft }}>
            <span>חומר גלם</span>
            <span>נדרש</span>
            <span>קיים</span>
            <span>יישאר</span>
            <span>מצב</span>
          </div>
          {previewRows.length === 0 ? (
            <div className="px-3 py-5 text-center text-sm" style={{ color: C.textSoft }}>
              בחרי מתכון וכמות כדי לראות הורדת מלאי.
            </div>
          ) : (
            previewRows.map(row => (
              <div key={row.id} className="grid grid-cols-5 gap-2 border-t px-3 py-2 text-xs" style={{ borderColor: C.borderSoft, color: C.text }}>
                <span className="truncate font-semibold">{row.name}</span>
                <span>{row.required.toLocaleString('he-IL')} {row.unit}</span>
                <span>{row.current.toLocaleString('he-IL')} {row.unit}</span>
                <span style={{ color: row.missing ? C.red : C.green }}>{row.remaining.toLocaleString('he-IL')} {row.unit}</span>
                <span className="font-bold" style={{ color: row.missing ? C.red : C.green }}>{row.missing ? 'חסר' : 'תקין'}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-lg border px-4 text-sm font-bold disabled:opacity-60"
            style={{ borderColor: C.border, color: C.textSoft }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => void confirmProduction()}
            disabled={!canSubmit}
            className="h-10 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: C.espresso }}
          >
            {submitting ? 'מבצע...' : 'אשר ייצור והורד מלאי'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
