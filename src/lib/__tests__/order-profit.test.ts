import { describe, expect, it } from 'vitest';
import {
  lineCost, orderProfit, aggregateByProduct, profitMargin,
  type ProfitLineSource, type UnitCosts,
} from '@/lib/order-profit';

const costs: UnitCosts = {
  product: new Map([['cake', 60], ['pie', 30]]),
  petitFour: new Map([['pf1', 2], ['pf2', 3]]),
};

const product = (id: string, qty: number, total: number, name = id): ProfitLineSource =>
  ({ סוג_שורה: 'מוצר', מוצר_id: id, גודל_מארז: null, כמות: qty, סהכ: total, שם_פריט_מותאם: null, שם_מוצר: name, בחירות: [] });

const pkg = (size: number, qty: number, total: number, sel: [string, number][]): ProfitLineSource =>
  ({ סוג_שורה: 'מארז', מוצר_id: null, גודל_מארז: size, כמות: qty, סהכ: total, שם_פריט_מותאם: null, בחירות: sel.map(([פטיפור_id, כמות]) => ({ פטיפור_id, כמות })) });

const custom = (name: string, total: number, type = 'מוצר_ידני'): ProfitLineSource =>
  ({ סוג_שורה: type, מוצר_id: null, גודל_מארז: null, כמות: 1, סהכ: total, שם_פריט_מותאם: name, בחירות: [] });

describe('lineCost', () => {
  it('costs a product by unit cost × quantity', () => {
    expect(lineCost(product('cake', 2, 400), costs)).toBe(120);
  });
  it('costs a package by its petit-four selections × package quantity', () => {
    // per package: 10×2 + 6×3 = 38; × 3 packages
    expect(lineCost(pkg(16, 3, 600, [['pf1', 10], ['pf2', 6]]), costs)).toBe(114);
  });
  it('returns null when a cost is unknown', () => {
    expect(lineCost(product('unknown', 1, 50), costs)).toBeNull();
    expect(lineCost(pkg(16, 1, 200, [['pf1', 10], ['nope', 6]]), costs)).toBeNull();
    expect(lineCost(pkg(16, 1, 200, []), costs)).toBeNull();
    expect(lineCost(custom('עוגה מיוחדת', 300), costs)).toBeNull();
  });
  it('treats a surcharge line as costless', () => {
    expect(lineCost(custom('עיטוף', 20, 'תוספת_תשלום'), costs)).toBe(0);
  });
});

describe('orderProfit', () => {
  it('spreads the pocket amount over the lines and subtracts cost', () => {
    // Lines sum 500; pocket (after discount, before VAT) 400 → factor 0.8.
    const p = orderProfit(400, [product('cake', 1, 300), product('pie', 2, 200)], costs);
    expect(p.complete).toBe(true);
    expect(p.cost).toBe(120);
    expect(p.profit).toBe(280);
    expect(p.lines.map(l => l.revenue)).toEqual([240, 160]);
  });

  it('marks an order with an uncosted line as incomplete and profits only the costed part', () => {
    const p = orderProfit(500, [product('cake', 1, 300), custom('עוגה מיוחדת', 200)], costs);
    expect(p.complete).toBe(false);
    expect(p.profit).toBeNull();
    expect(p.missing).toEqual(['עוגה מיוחדת']);
    expect(p.coveredRevenue).toBe(300);
    expect(p.partialProfit).toBe(240);
  });

  it('a barter order (pocket 0) shows only its cost', () => {
    const p = orderProfit(0, [product('cake', 1, 300)], costs);
    expect(p.revenue).toBe(0);
    expect(p.profit).toBe(-60);
  });

  it('handles an empty order', () => {
    const p = orderProfit(0, [], costs);
    expect(p).toMatchObject({ revenue: 0, cost: 0, profit: 0, complete: true });
  });
});

describe('aggregateByProduct', () => {
  it('groups lines by product and package size across orders', () => {
    const o1 = orderProfit(300, [product('cake', 1, 300, 'עוגה')], costs);
    const o2 = orderProfit(600, [product('cake', 2, 600, 'עוגה'), pkg(16, 1, 0, [['pf1', 16]])], costs);
    const rows = aggregateByProduct([o1, o2]);
    const cake = rows.find(r => r.key === 'p:cake')!;
    expect(cake).toMatchObject({ qty: 3, orders: 2, revenue: 900, cost: 180, profit: 720, margin: 80 });
    expect(rows.find(r => r.key === 'pkg:16')).toMatchObject({ label: 'מארז 16 יח׳', cost: 32 });
  });

  it('leaves surcharge lines out and reports uncosted units', () => {
    const o = orderProfit(320, [custom('עיטוף', 20, 'תוספת_תשלום'), custom('מגש', 300)], costs);
    const rows = aggregateByProduct([o]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'מגש', uncostedQty: 1, profit: null, margin: null });
  });
});

describe('profitMargin', () => {
  it('computes a one-decimal percentage', () => {
    expect(profitMargin(25, 80)).toBe(31.3);
    expect(profitMargin(null, 80)).toBeNull();
    expect(profitMargin(10, 0)).toBeNull();
  });
});
