import { describe, it, expect } from 'vitest';
import {
  computeRowCost, compatibleUnits,
  type CostInputs, type CostRawMaterial, type CostRecipe,
} from '@/lib/product-costs';

const raw = (id: string, price: number | null, unit: string, withVat = false): CostRawMaterial =>
  ({ id, שם_חומר_גלם: id, יחידת_מידה: unit, מחיר_ליחידה: price, מחיר_כולל_מעמ: withVat, תאריך_עדכון: null });

const rawById = new Map([
  raw('box', 2.5, 'יחידה'),
  raw('note', 1.18, 'יחידה', true),
  raw('choc', 80, 'ק"ג'),
  raw('ribbon', null, 'יחידה'),
  raw('flour', 0.01, 'גרם'),
].map(m => [m.id, m]));

const recipesById = new Map<string, CostRecipe>([['cake', {
  id: 'cake', שם_מתכון: 'cake', כמות_תוצר: 10, יחידת_תפוקה: null,
  production_target_type: null, production_target_id: null,
  רכיבי_מתכון: [{ חומר_גלם_id: 'flour', כמות_נדרשת: 1000, יחידת_מידה: 'גרם' }],
}]]);

const base: CostInputs = {
  מתכון_id: null, מתכונים: [], חומרים: [], חומרים_לפי_מתכון: false,
  עלות_חומרים_ידנית: null, זמן_עבודה_דקות: null, יחידות_בזמן_עבודה: 1, עלות_עבודה_ידנית: 1,
};

describe('direct raw materials on a cost row', () => {
  it('prices a box and a note card without any recipe (note price includes VAT)', () => {
    const cost = computeRowCost({
      ...base,
      חומרים: [
        { חומר_גלם_id: 'box', כמות: 1, יחידת_מידה: 'יחידה' },
        { חומר_גלם_id: 'note', כמות: 1, יחידת_מידה: 'יחידה' },
      ],
    }, recipesById, rawById, null);
    // 2.5 + 1.18/1.18
    expect(cost.materials).toBe(3.5);
    expect(cost.materialsSource).toBe('items');
    expect(cost.extraMaterials).toBe(3.5);
    expect(cost.extraCount).toBe(2);
    expect(cost.total).toBe(4.5);
    expect(cost.complete).toBe(true);
  });

  it('adds on top of the recipes', () => {
    const cost = computeRowCost({
      ...base, חומרים_לפי_מתכון: true, מתכונים: [{ מתכון_id: 'cake', יחידות: 10 }],
      חומרים: [{ חומר_גלם_id: 'box', כמות: 1, יחידת_מידה: 'יחידה' }],
    }, recipesById, rawById, null);
    // cake 10/10 = 1 + box 2.5
    expect(cost.materials).toBe(3.5);
    expect(cost.materialsSource).toBe('recipe');
  });

  it('adds on top of the manual amount', () => {
    const cost = computeRowCost({
      ...base, עלות_חומרים_ידנית: 10, חומרים: [{ חומר_גלם_id: 'box', כמות: 2, יחידת_מידה: 'יחידה' }],
    }, recipesById, rawById, null);
    expect(cost.materials).toBe(15);
    expect(cost.materialsSource).toBe('manual');
  });

  it('converts units — 50 גרם of a per-ק"ג material', () => {
    const cost = computeRowCost({
      ...base, חומרים: [{ חומר_גלם_id: 'choc', כמות: 50, יחידת_מידה: 'גרם' }],
    }, recipesById, rawById, null);
    expect(cost.materials).toBe(4);
  });

  it('flags a material without a price and marks the cost incomplete', () => {
    const cost = computeRowCost({
      ...base, חומרים: [{ חומר_גלם_id: 'ribbon', כמות: 1, יחידת_מידה: 'יחידה' }],
    }, recipesById, rawById, null);
    expect(cost.materials).toBe(0);
    expect(cost.recipeIssues).toBe(1);
    expect(cost.complete).toBe(false);
  });

  it('keeps old rows (no materials) unchanged', () => {
    const cost = computeRowCost({ ...base, חומרים: undefined, עלות_חומרים_ידנית: 7 }, recipesById, rawById, null);
    expect(cost.materials).toBe(7);
    expect(cost.extraCount).toBe(0);
  });
});

describe('compatibleUnits', () => {
  it('offers convertible units after the material’s own unit', () => {
    expect(compatibleUnits('ק"ג')).toEqual(['ק"ג', 'גרם']);
    expect(compatibleUnits('יחידה')).toEqual(['יחידה']);
    expect(compatibleUnits('קופסה')).toEqual(['קופסה']);
  });
});
