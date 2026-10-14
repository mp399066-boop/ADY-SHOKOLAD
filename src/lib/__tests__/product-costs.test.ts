import { describe, expect, it } from 'vitest';
import {
  unitFactor, normalizeUnit, recipeCost, computeRowCost, laborFromTime, marginPct, netUnitPrice,
  type CostRecipe, type CostRawMaterial, type CostInputs,
} from '@/lib/product-costs';
import { rawPriceSchema } from '@/lib/product-costs-schema';

const raw = (id: string, unit: string, price: number | null): CostRawMaterial =>
  ({ id, שם_חומר_גלם: id, יחידת_מידה: unit, מחיר_ליחידה: price, תאריך_עדכון: null });

const recipe = (ings: [string, number, string][], yieldQty = 10): CostRecipe => ({
  id: 'r1', שם_מתכון: 'טראפל', כמות_תוצר: yieldQty, יחידת_תפוקה: 'יחידה',
  production_target_type: null, production_target_id: null,
  רכיבי_מתכון: ings.map(([חומר_גלם_id, כמות_נדרשת, יחידת_מידה]) => ({ חומר_גלם_id, כמות_נדרשת, יחידת_מידה })),
});

describe('units', () => {
  it('normalizes Hebrew abbreviations', () => {
    expect(normalizeUnit('ק"ג')).toBe('קג');
    expect(normalizeUnit('ק״ג')).toBe('קג');
    expect(normalizeUnit('יח׳')).toBe('יח');
  });
  it('converts within a family, refuses across families', () => {
    expect(unitFactor('גרם', 'ק"ג')).toBe(0.001);
    expect(unitFactor('ליטר', 'מל')).toBe(1000);
    expect(unitFactor('גרם', 'יחידה')).toBeNull();
  });
});

describe('recipeCost', () => {
  const mats = new Map([
    ['choc', raw('choc', 'ק"ג', 80)],
    ['cream', raw('cream', 'ליטר', 20)],
    ['noprice', raw('noprice', 'גרם', null)],
  ]);
  it('prices each line in the material unit and divides by yield', () => {
    const rc = recipeCost(recipe([['choc', 500, 'גרם'], ['cream', 250, 'מל']]), mats);
    expect(rc.batchTotal).toBe(45); // 0.5kg × 80 + 0.25L × 20
    expect(rc.perUnit).toBe(4.5);
    expect(rc.complete).toBe(true);
  });
  it('flags missing price, unit mismatch and deleted material', () => {
    const rc = recipeCost(recipe([['noprice', 5, 'גרם'], ['choc', 2, 'יחידה'], ['gone', 1, 'גרם']]), mats);
    expect(rc.lines.map(l => l.issue)).toEqual(['no_price', 'unit_mismatch', 'missing_material']);
    expect(rc.complete).toBe(false);
  });
});

describe('row cost & margin', () => {
  it('labor from time: 60 min for 10 units at ₪50/h = ₪5 each', () => expect(laborFromTime(60, 10, 50)).toBe(5));
  it('time without an hourly rate falls back to manual labor and says so', () => {
    const row: CostInputs = {
      מתכון_id: null, חומרים_לפי_מתכון: false, עלות_חומרים_ידנית: 3,
      זמן_עבודה_דקות: 30, יחידות_בזמן_עבודה: 1, עלות_עבודה_ידנית: 2,
    } as CostInputs;
    const r = computeRowCost(row, new Map(), new Map(), null);
    expect(r.laborSource).toBe('manual');
    expect(r.laborNeedsRate).toBe(true);
    expect(r.total).toBe(5);
  });
  it('margin %', () => {
    expect(marginPct(100, 60)).toBe(40);
    expect(marginPct(0, 10)).toBeNull();
    expect(marginPct(100, null)).toBeNull();
  });
});

describe('VAT on raw-material prices', () => {
  it('uses the price before VAT for cost', () => {
    const withVat: CostRawMaterial = { ...raw('choc', 'ק"ג', 118), מחיר_כולל_מעמ: true };
    expect(netUnitPrice(withVat)).toBeCloseTo(100, 6);
    expect(netUnitPrice(raw('choc', 'ק"ג', 118))).toBe(118);
    expect(netUnitPrice(raw('x', 'ק"ג', null))).toBeNull();
    const rc = recipeCost(recipe([['choc', 500, 'גרם']]), new Map([['choc', withVat]]));
    expect(rc.batchTotal).toBe(50);
    expect(rc.lines[0].price).toBeCloseTo(100, 6);
  });
  it('validates the PATCH body', () => {
    expect(rawPriceSchema.safeParse({ מחיר_כולל_מעמ: true }).success).toBe(true);
    expect(rawPriceSchema.safeParse({ מחיר_ליחידה: 12 }).success).toBe(true);
    expect(rawPriceSchema.safeParse({}).success).toBe(false);
    expect(rawPriceSchema.safeParse({ מחיר_כולל_מעמ: 'yes' }).success).toBe(false);
  });
});
