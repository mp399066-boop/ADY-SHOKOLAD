// Pure ledger math for inventory-deduct.ts — no database access, unit-tested.

export interface MovementRow {
  מזהה_פריט:  string | null;
  סוג_פריט:   string | null;
  שם_פריט:    string | null;
  סוג_תנועה:  string | null;
  כמות:       number | null;
}

export type LedgerByItem = Map<string, { kind: string; name: string; net: number }>;
export type DesiredQuantities = Map<string, { kind: 'מוצר' | 'פטיפור'; qty: number }>;

// Per-item net amount (יציאה − כניסה) and the total. net > 0 means that item
// is currently "out" by that quantity.
export function summarizeLedger(rows: MovementRow[]): { totalNet: number; byItem: LedgerByItem } {
  const byItem: LedgerByItem = new Map();
  let totalNet = 0;
  for (const r of rows) {
    if (!r.מזהה_פריט || !r.סוג_פריט) continue;
    const qty   = Number(r.כמות || 0);
    const delta = r.סוג_תנועה === 'יציאה' ? qty
                : r.סוג_תנועה === 'כניסה' ? -qty
                : 0; // התאמה rows shouldn't appear here; ignore defensively
    const cur = byItem.get(r.מזהה_פריט) ?? { kind: r.סוג_פריט, name: r.שם_פריט || '', net: 0 };
    cur.net += delta;
    if (!cur.name && r.שם_פריט) cur.name = r.שם_פריט;
    byItem.set(r.מזהה_פריט, cur);
    totalNet += delta;
  }
  return { totalNet, byItem };
}

// What the order's CURRENT items consume: product lines by product, plus
// petit-fours inside packages (selection qty × package line qty).
export function buildDesiredQuantities(
  productLines: Array<{ מוצר_id: string | null; כמות: number | null }>,
  packageLines: Array<{ id: string; כמות: number | null }>,
  selections:   Array<{ שורת_הזמנה_id: string; פטיפור_id: string | null; כמות: number | null }>,
): DesiredQuantities {
  const desired: DesiredQuantities = new Map();
  for (const item of productLines) {
    if (!item.מוצר_id) continue;
    const qty = Number(item.כמות) || 0;
    if (qty <= 0) continue;
    const cur = desired.get(item.מוצר_id);
    desired.set(item.מוצר_id, { kind: 'מוצר', qty: (cur?.qty || 0) + qty });
  }

  const packageQtyByLine: Record<string, number> = {};
  for (const pl of packageLines) packageQtyByLine[pl.id] = pl.כמות || 1;
  for (const sel of selections) {
    if (!sel.פטיפור_id) continue;
    const total = (sel.כמות || 0) * (packageQtyByLine[sel.שורת_הזמנה_id] || 1);
    if (total <= 0) continue;
    const cur = desired.get(sel.פטיפור_id);
    desired.set(sel.פטיפור_id, { kind: 'פטיפור', qty: (cur?.qty || 0) + total });
  }
  return desired;
}

export interface ReconcileDelta {
  itemId:     string;
  kind:       'מוצר' | 'פטיפור';
  /** > 0 → deduct more; < 0 → give back to stock. Never 0. */
  delta:      number;
  ledgerName: string;
}

// desired − ledger net, per item. Items only in the ledger (removed from the
// order) get a negative delta. Raw-material rows (manual ledger entries only)
// have nothing to reconcile against and are skipped.
export function computeReconcileDeltas(desired: DesiredQuantities, ledger: LedgerByItem): ReconcileDelta[] {
  const allItemIds = new Set<string>([...Array.from(desired.keys()), ...Array.from(ledger.keys())]);
  const out: ReconcileDelta[] = [];
  for (const itemId of Array.from(allItemIds)) {
    const want  = desired.get(itemId);
    const led   = ledger.get(itemId);
    const delta = (want?.qty ?? 0) - (led?.net ?? 0);
    if (delta === 0) continue;
    const kind = want?.kind ?? led?.kind;
    if (kind !== 'מוצר' && kind !== 'פטיפור') continue;
    out.push({ itemId, kind, delta, ledgerName: led?.name || '' });
  }
  return out;
}
