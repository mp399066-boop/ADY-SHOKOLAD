import { describe, expect, it } from 'vitest';
import {
  buildDesiredQuantities,
  computeReconcileDeltas,
  summarizeLedger,
  type MovementRow,
} from '../inventory-ledger';

const out = (id: string, kind: string, qty: number, name = ''): MovementRow =>
  ({ מזהה_פריט: id, סוג_פריט: kind, שם_פריט: name, סוג_תנועה: 'יציאה', כמות: qty });
const back = (id: string, kind: string, qty: number): MovementRow =>
  ({ מזהה_פריט: id, סוג_פריט: kind, שם_פריט: null, סוג_תנועה: 'כניסה', כמות: qty });

describe('summarizeLedger', () => {
  it('nets יציאה against כניסה per item', () => {
    const { totalNet, byItem } = summarizeLedger([
      out('a', 'מוצר', 5, 'מארז'), back('a', 'מוצר', 2), out('b', 'פטיפור', 10),
    ]);
    expect(byItem.get('a')).toEqual({ kind: 'מוצר', name: 'מארז', net: 3 });
    expect(byItem.get('b')?.net).toBe(10);
    expect(totalNet).toBe(13);
  });

  it('a fully restored order nets to 0', () => {
    expect(summarizeLedger([out('a', 'מוצר', 4), back('a', 'מוצר', 4)]).totalNet).toBe(0);
  });

  it('ignores rows without an item id/kind and unknown movement types', () => {
    const { totalNet } = summarizeLedger([
      { מזהה_פריט: null, סוג_פריט: 'מוצר', שם_פריט: null, סוג_תנועה: 'יציאה', כמות: 9 },
      { מזהה_פריט: 'x', סוג_פריט: 'מוצר', שם_פריט: null, סוג_תנועה: 'התאמה', כמות: 9 },
    ]);
    expect(totalNet).toBe(0);
  });
});

describe('buildDesiredQuantities', () => {
  it('sums product lines and multiplies petit-fours by package quantity', () => {
    const desired = buildDesiredQuantities(
      [{ מוצר_id: 'p1', כמות: 2 }, { מוצר_id: 'p1', כמות: 3 }, { מוצר_id: null, כמות: 7 }, { מוצר_id: 'p2', כמות: 0 }],
      [{ id: 'line1', כמות: 3 }],
      [{ שורת_הזמנה_id: 'line1', פטיפור_id: 'pf1', כמות: 4 }],
    );
    expect(desired.get('p1')).toEqual({ kind: 'מוצר', qty: 5 });
    expect(desired.has('p2')).toBe(false);
    expect(desired.get('pf1')).toEqual({ kind: 'פטיפור', qty: 12 });
  });

  it('a package line with no quantity counts as 1', () => {
    const desired = buildDesiredQuantities([], [{ id: 'l', כמות: null }], [{ שורת_הזמנה_id: 'l', פטיפור_id: 'pf', כמות: 6 }]);
    expect(desired.get('pf')?.qty).toBe(6);
  });
});

describe('computeReconcileDeltas', () => {
  it('nothing changed → no deltas (idempotent)', () => {
    const desired = buildDesiredQuantities([{ מוצר_id: 'a', כמות: 3 }], [], []);
    const { byItem } = summarizeLedger([out('a', 'מוצר', 3)]);
    expect(computeReconcileDeltas(desired, byItem)).toEqual([]);
  });

  it('order grew → positive delta; shrank → negative; removed item → give it all back', () => {
    const desired = buildDesiredQuantities([{ מוצר_id: 'a', כמות: 5 }, { מוצר_id: 'b', כמות: 1 }], [], []);
    const { byItem } = summarizeLedger([out('a', 'מוצר', 3), out('b', 'מוצר', 4), out('c', 'מוצר', 2, 'קופסה')]);
    const deltas = computeReconcileDeltas(desired, byItem);
    expect(deltas).toEqual(expect.arrayContaining([
      { itemId: 'a', kind: 'מוצר', delta: 2, ledgerName: '' },
      { itemId: 'b', kind: 'מוצר', delta: -3, ledgerName: '' },
      { itemId: 'c', kind: 'מוצר', delta: -2, ledgerName: 'קופסה' },
    ]));
    expect(deltas).toHaveLength(3);
  });

  it('an active order never deducted gets a full deduction', () => {
    const desired = buildDesiredQuantities([{ מוצר_id: 'a', כמות: 4 }], [], []);
    expect(computeReconcileDeltas(desired, new Map())).toEqual([{ itemId: 'a', kind: 'מוצר', delta: 4, ledgerName: '' }]);
  });

  it('skips raw-material ledger rows (nothing to reconcile against)', () => {
    const { byItem } = summarizeLedger([out('raw', 'חומר_גלם', 8)]);
    expect(computeReconcileDeltas(new Map(), byItem)).toEqual([]);
  });
});
