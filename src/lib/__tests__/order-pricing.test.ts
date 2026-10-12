import { describe, expect, it } from 'vitest';
import {
  computeEffectivePriceType,
  resolvePriceListEntry,
  totalQtyForProduct,
  type PriceEntry,
} from '../order-pricing';

const PRICES: PriceEntry[] = [
  { מוצר_id: 'box', price_type: 'retail', מחיר: 100, min_quantity: null },
  { מוצר_id: 'box', price_type: 'business_fixed', מחיר: 80, min_quantity: null },
  { מוצר_id: 'box', price_type: 'business_quantity', מחיר: 75, min_quantity: 10 },
  { מוצר_id: 'box', price_type: 'business_quantity', מחיר: 70, min_quantity: 50 },
  { מוצר_id: 'cake', price_type: 'retail', מחיר: 1500, min_quantity: null },
  { מוצר_id: 'cake2', price_type: 'retail', מחיר: 1200, min_quantity: null },
];
const PRODUCTS = [
  { id: 'box', קטגוריית_מוצר: 'מארז' },
  { id: 'cake', קטגוריית_מוצר: 'עוגה' },
  { id: 'cake2', קטגוריית_מוצר: 'עוגה' },
];

describe('resolvePriceListEntry', () => {
  it('returns the fixed-type entry', () => {
    expect(resolvePriceListEntry(PRICES, 'box', 'business_fixed', 1)?.מחיר).toBe(80);
  });

  it('picks the highest quantity tier the quantity reaches', () => {
    expect(resolvePriceListEntry(PRICES, 'box', 'business_quantity', 10)?.מחיר).toBe(75);
    expect(resolvePriceListEntry(PRICES, 'box', 'business_quantity', 49)?.מחיר).toBe(75);
    expect(resolvePriceListEntry(PRICES, 'box', 'business_quantity', 50)?.מחיר).toBe(70);
  });

  it('below every tier falls back to the lowest tier (dearest price), not no price', () => {
    expect(resolvePriceListEntry(PRICES, 'box', 'business_quantity', 3)?.מחיר).toBe(75);
  });

  it('returns undefined when the product has no price of that type', () => {
    expect(resolvePriceListEntry(PRICES, 'cake', 'business_fixed', 1)).toBeUndefined();
  });
});

describe('totalQtyForProduct', () => {
  it('sums one product across all lines (multi-recipient orders)', () => {
    const items = [
      { מוצר_id: 'box', כמות: 1 }, { מוצר_id: 'box', כמות: 2 }, { מוצר_id: 'cake', כמות: 5 },
    ];
    expect(totalQtyForProduct(items, 'box')).toBe(3);
  });

  it('is 0 for an empty product id', () => {
    expect(totalQtyForProduct([{ מוצר_id: '', כמות: 4 }], '')).toBe(0);
  });
});

describe('computeEffectivePriceType', () => {
  it('business customer types map straight to their tier', () => {
    expect(computeEffectivePriceType('עסקי - כמות', [], PRODUCTS, PRICES)).toBe('business_quantity');
    expect(computeEffectivePriceType('עסקי - קבוע', [], PRODUCTS, PRICES)).toBe('business_fixed');
    expect(computeEffectivePriceType('עסקי', [], PRODUCTS, PRICES)).toBe('business_fixed');
  });

  it('private customer stays retail for a small order', () => {
    expect(computeEffectivePriceType('פרטי', [{ מוצר_id: 'box', כמות: 3 }], PRODUCTS, PRICES)).toBe('retail');
  });

  it('250 units or more upgrades a private order to the event tier', () => {
    expect(computeEffectivePriceType('פרטי', [{ מוצר_id: 'box', כמות: 250 }], PRODUCTS, PRICES)).toBe('retail_quantity');
    // Lines without a product do not count toward the units threshold.
    expect(computeEffectivePriceType('פרטי', [{ מוצר_id: '', כמות: 300 }], PRODUCTS, PRICES)).toBe('retail');
  });

  it('₪2,500 at retail upgrades to the event tier', () => {
    expect(computeEffectivePriceType('פרטי', [{ מוצר_id: 'box', כמות: 25 }], PRODUCTS, PRICES)).toBe('retail_quantity');
    expect(computeEffectivePriceType('פרטי', [{ מוצר_id: 'box', כמות: 24 }], PRODUCTS, PRICES)).toBe('retail');
  });

  it('only the single largest cake counts toward the ₪2,500 threshold', () => {
    // 1500 + 1200 = 2700 in cakes, but only the 1500 cake counts → retail.
    const items = [{ מוצר_id: 'cake', כמות: 1 }, { מוצר_id: 'cake2', כמות: 1 }];
    expect(computeEffectivePriceType('פרטי', items, PRODUCTS, PRICES)).toBe('retail');
    // Largest cake 1500 + boxes 1000 = 2500 → event tier.
    expect(computeEffectivePriceType('פרטי', [...items, { מוצר_id: 'box', כמות: 10 }], PRODUCTS, PRICES)).toBe('retail_quantity');
  });
});
