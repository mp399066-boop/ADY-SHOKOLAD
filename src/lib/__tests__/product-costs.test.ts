import { describe, it, expect } from 'vitest';
import {
  computeRowCost, rowRecipeParts,
  type CostInputs, type CostRawMaterial, type CostRecipe,
} from '@/lib/product-costs';

const raw = (id: string, price: number, unit = 'גרם'): CostRawMaterial =>
  ({ id, שם_חומר_גלם: id, יחידת_מידה: unit, מחיר_ליחידה: price, מחיר_כולל_מעמ: false, תאריך_עדכון: null });

const recipe = (id: string, yieldUnits: number, ings: [string, number][]): CostRecipe => ({
  id, שם_מתכון: id, כמות_תוצר: yieldUnits, יחידת_תפוקה: null,
  production_target_type: null, production_target_id: null,
  רכיבי_מתכון: ings.map(([m, q]) => ({ חומר_גלם_id: m, כמות_נדרשת: q, יחידת_מידה: 'גרם' })),
});

// Batch costs: cookies ₪100 (100 units), cream ₪60 (120), disc ₪50 (250).
const rawById = new Map([raw('flour', 0.1), raw('cream', 0.05), raw('choc', 0.05)].map(m => [m.id, m]));
const recipesById = new Map([
  recipe('cookies', 100, [['flour', 1000]]),
  recipe('cream', 120, [['cream', 1200]]),
  recipe('disc', 250, [['choc', 1000]]),
].map(r => [r.id, r]));

const base: CostInputs = {
  מתכון_id: null, מתכונים: [], חומרים_לפי_מתכון: true,
  עלות_חומרים_ידנית: null, זמן_עבודה_דקות: null, יחידות_בזמן_עבודה: 1, עלות_עבודה_ידנית: null,
};

describe('sub-recipe material cost', () => {
  it('sums each recipe batch cost ÷ the units it makes', () => {
    const cost = computeRowCost({
      ...base,
      מתכונים: [
        { מתכון_id: 'cookies', יחידות: 100 },
        { מתכון_id: 'cream', יחידות: 120 },
        { מתכון_id: 'disc', יחידות: 250 },
      ],
    }, recipesById, rawById, null);
    // 100/100 + 60/120 + 50/250 = 1 + 0.5 + 0.2
    expect(cost.materials).toBe(1.7);
    expect(cost.materialsSource).toBe('recipe');
  });

  it('uses the per-product units, not the recipe yield', () => {
    const parts = rowRecipeParts({ מתכון_id: null, מתכונים: [{ מתכון_id: 'cream', יחידות: 60 }] }, recipesById, rawById);
    expect(parts[0].perUnit).toBe(1);
  });

  it('falls back to the single recipe at its own yield (before migration 070)', () => {
    const cost = computeRowCost({ ...base, מתכון_id: 'cream', מתכונים: undefined }, recipesById, rawById, null);
    expect(cost.materials).toBe(0.5);
  });

  it('skips deleted recipes and uses the manual amount when none are left', () => {
    const cost = computeRowCost({
      ...base, מתכונים: [{ מתכון_id: 'gone', יחידות: 10 }], עלות_חומרים_ידנית: 3,
    }, recipesById, rawById, null);
    expect(cost.materials).toBe(3);
    expect(cost.materialsSource).toBe('manual');
  });

  it('ignores recipes when the row is set to a manual amount', () => {
    const cost = computeRowCost({
      ...base, חומרים_לפי_מתכון: false, מתכונים: [{ מתכון_id: 'cookies', יחידות: 100 }], עלות_חומרים_ידנית: 2,
    }, recipesById, rawById, null);
    expect(cost.materials).toBe(2);
  });
});
