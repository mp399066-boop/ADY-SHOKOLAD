// ============================================================================
// Inventory deduction & restoration — single source of truth.
//
// Policy (May 2026, owner-driven):
//   Stock drops EXACTLY ONCE per order at the moment the order becomes a
//   "real" order — created/finalized as non-draft, non-cancelled. Not on
//   payment status changes. The reason is operational: a confirmed order
//   already consumes production capacity, and inventory numbers must
//   reflect that immediately so the operator can answer "how many more
//   orders can I take" without waiting for payment.
//
// Restoration: when an order is cancelled (סטטוס_הזמנה → 'בוטלה'), if
// it had been deducted, restore the same quantities back to stock.
//
// Reconciliation (Sep 2026): when an order's items are edited after the
// deduction (PUT /api/orders/[id]/items), reconcileOrderInventory applies
// the per-item delta between the order's current items and the ledger net,
// so edits no longer cause silent drift.
//
// Negative stock (Sep 2026): deductions are no longer clamped at 0. If an
// order takes more than the recorded stock, the number goes negative —
// that's the honest state, and a later manual stock entry lands on the
// correct remainder instead of hiding the shortfall.
//
// Idempotency model — net ledger:
//   For each order we look at תנועות_מלאי rows with
//   סוג_מקור='הזמנה', מזהה_מקור=<orderId>. The "current state" is:
//
//     net_per_item = Σ(יציאה.כמות) − Σ(כניסה.כמות)
//
//   • net > 0 → order is currently deducted; subsequent deductOrderInventory
//                calls are no-ops.
//   • net = 0 → order is not currently deducted (never was, or was fully
//                restored); subsequent restoreOrderInventory calls are
//                no-ops.
//
//   Restoration uses the existing ledger as source of truth (not the
//   order's current items) — if the operator edited line items between
//   the deduction and the cancellation, the original deduction's
//   per-item amounts are what we restore.
//
// סאטמר orders: existing business rule preserved — never deduct. The
// caller is responsible for that gate (we have no way to gate from
// here without re-fetching the order, and call sites already know).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { recordStockMovement } from '@/lib/inventory-movements';
import { isServiceEnabled, logServiceRun } from '@/lib/system-services';
import { logActivity } from '@/lib/activity-log';

// ─── Policy switches ────────────────────────────────────────────────────────

// Live runtime switch — flip this in code to revert to "deduct on
// payment". Kept for safety; the active policy under this constant is
// "deduct on real order creation/finalization".
export const DEDUCT_INVENTORY_ON_ORDER_CREATION = true;

// Legacy flag — left for any caller still importing the name. New code
// shouldn't reference it. Kept truthy so existing call sites that read
// it (none after this rewrite) don't unexpectedly start no-op'ing.
export const DEDUCT_INVENTORY_ON_PAYMENT_PAID = false;
export const DEDUCT_INVENTORY_ON_ORDER_STATUS = false;

// ─── Types ──────────────────────────────────────────────────────────────────

type AnySupabase = ReturnType<typeof createAdminClient>;

export type DeductionResult =
  | { deducted: true;  productCount: number; petitFourTypes: number }
  | { deducted: false; reason: 'already_deducted' | 'no_items' | 'fetch_failed' | 'flag_off' };

export type RestoreResult =
  | { restored: true;  productCount: number; petitFourTypes: number }
  | { restored: false; reason: 'not_currently_deducted' | 'no_items' | 'fetch_failed' | 'flag_off' };

export type ReconcileResult =
  | { reconciled: true;  adjustedItems: number }
  | { reconciled: false; reason: 'flag_off' | 'fetch_failed' | 'not_applicable' | 'no_changes' };

// ─── Ledger helpers ─────────────────────────────────────────────────────────

interface MovementRow {
  מזהה_פריט:  string | null;
  סוג_פריט:   string | null;
  שם_פריט:    string | null;
  סוג_תנועה:  string | null;
  כמות:       number | null;
}

// Returns the current deduction state for an order: per-item net amount
// (יציאה − כניסה) and totals. net_per_item > 0 means that item is
// currently "out" by that quantity.
async function loadOrderLedgerNet(supabase: AnySupabase, orderId: string): Promise<{
  totalNet:        number;
  byItem:          Map<string, { kind: string; name: string; net: number }>;
  fetchFailed:     boolean;
}> {
  const { data, error } = await supabase
    .from('תנועות_מלאי')
    .select('מזהה_פריט, סוג_פריט, שם_פריט, סוג_תנועה, כמות')
    .eq('סוג_מקור', 'הזמנה')
    .eq('מזהה_מקור', orderId);
  if (error) {
    console.error('[inventory] ledger lookup failed. order:', orderId, '| error:', error.message);
    return { totalNet: 0, byItem: new Map(), fetchFailed: true };
  }
  const rows = (data ?? []) as MovementRow[];
  const byItem = new Map<string, { kind: string; name: string; net: number }>();
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
  return { totalNet, byItem, fetchFailed: false };
}

async function commonGate(supabase: AnySupabase, orderId: string, label: string): Promise<{ enabled: boolean; reason?: 'flag_off' }> {
  if (!DEDUCT_INVENTORY_ON_ORDER_CREATION) {
    console.log(`[inventory] ${label} skipped — DEDUCT_INVENTORY_ON_ORDER_CREATION is false. order:`, orderId);
    return { enabled: false, reason: 'flag_off' };
  }
  const enabled = await isServiceEnabled(supabase, 'inventory_deduction');
  if (!enabled) {
    console.log(`[inventory] ${label} skipped — service "inventory_deduction" is OFF in control center. order:`, orderId);
    await logServiceRun(supabase, {
      serviceKey:  'inventory_deduction',
      action:      label === 'deduction' ? 'deduct_order' : 'restore_order',
      status:      'disabled',
      relatedType: 'order',
      relatedId:   orderId,
      message:     `service disabled — inventory was NOT ${label === 'deduction' ? 'deducted' : 'restored'}`,
    });
    return { enabled: false, reason: 'flag_off' };
  }
  return { enabled: true };
}

// ─── Public API — deduction ─────────────────────────────────────────────────

/**
 * Deduct an order's items from stock. Idempotent: re-running on an
 * already-deducted order is a no-op (returns reason='already_deducted').
 *
 * Trigger sites: order creation (create-full), draft finalization
 * (finalize-draft), website order import (woocommerce-order webhook).
 *
 * The caller is responsible for the סאטמר exclusion — pass orderId only
 * for orders that should deduct.
 */
export async function deductOrderInventory(
  supabase: AnySupabase,
  orderId: string,
): Promise<DeductionResult> {
  const gate = await commonGate(supabase, orderId, 'deduction');
  if (!gate.enabled) return { deducted: false, reason: gate.reason || 'flag_off' };

  // ── Idempotency check (net-based) ───────────────────────────────────────
  const ledger = await loadOrderLedgerNet(supabase, orderId);
  if (ledger.fetchFailed) return { deducted: false, reason: 'fetch_failed' };
  if (ledger.totalNet > 0) {
    console.log('[inventory] deduction skipped — already deducted (net > 0). order:', orderId, '| net:', ledger.totalNet);
    return { deducted: false, reason: 'already_deducted' };
  }

  console.log('[inventory] deducting because order is real/active. order:', orderId);

  // ── 1. Finished products (סוג_שורה = 'מוצר') ──────────────────────────
  const { data: items, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('מוצר_id, כמות')
    .eq('הזמנה_id', orderId)
    .eq('סוג_שורה', 'מוצר');

  if (itemsErr) {
    console.error('[inventory] fetch מוצרים_בהזמנה (products) failed. order:', orderId, '| error:', itemsErr.message);
    return { deducted: false, reason: 'fetch_failed' };
  }

  let productCount = 0;
  for (const item of items ?? []) {
    if (!item.מוצר_id) continue;
    const { data: product } = await supabase
      .from('מוצרים_למכירה')
      .select('שם_מוצר, כמות_במלאי')
      .eq('id', item.מוצר_id)
      .single();
    if (!product) continue;
    const qty = Number(item.כמות) || 0;
    if (qty <= 0) continue;
    const before = Number(product.כמות_במלאי) || 0;
    // No clamping at 0 (Sep 2026): stock may go negative. Clamping used to
    // silently swallow the shortfall — an order of 5 against a recorded 3
    // deducted only 3 and the missing 2 vanished from the ledger forever,
    // so late stock entry created permanent drift. A negative number is
    // honest: it means "more was promised than was recorded in stock".
    const after = before - qty;
    await supabase
      .from('מוצרים_למכירה')
      .update({ כמות_במלאי: after })
      .eq('id', item.מוצר_id);
    await recordStockMovement(supabase, {
      itemKind:    'מוצר',
      itemId:      item.מוצר_id,
      itemName:    product.שם_מוצר || '',
      before,
      after,
      sourceKind:  'הזמנה',
      sourceId:    orderId,
      notes:       'הורדה אוטומטית על יצירת הזמנה פעילה',
    });
    productCount++;
  }

  // ── 2. Package petit-fours (סוג_שורה = 'מארז') ────────────────────────
  const { data: packageLines } = await supabase
    .from('מוצרים_בהזמנה')
    .select('id, כמות')
    .eq('הזמנה_id', orderId)
    .eq('סוג_שורה', 'מארז');

  type PackageLineRow = { id: string; כמות: number | null };
  type PFSelectionRow = { שורת_הזמנה_id: string; פטיפור_id: string | null; כמות: number | null };

  const packageLineRows = (packageLines ?? []) as PackageLineRow[];
  let petitFourTypes = 0;
  if (packageLineRows.length > 0) {
    const packageIds = packageLineRows.map(p => p.id);
    const packageQtyByLine: Record<string, number> = {};
    for (const pl of packageLineRows) packageQtyByLine[pl.id] = pl.כמות || 1;

    const { data: selections } = await supabase
      .from('בחירת_פטיפורים_בהזמנה')
      .select('שורת_הזמנה_id, פטיפור_id, כמות')
      .in('שורת_הזמנה_id', packageIds);

    const selectionRows = (selections ?? []) as PFSelectionRow[];
    if (selectionRows.length > 0) {
      const totalsByPF: Record<string, number> = {};
      for (const sel of selectionRows) {
        const pkgQty = packageQtyByLine[sel.שורת_הזמנה_id] || 1;
        const total = (sel.כמות || 0) * pkgQty;
        if (!sel.פטיפור_id || total <= 0) continue;
        totalsByPF[sel.פטיפור_id] = (totalsByPF[sel.פטיפור_id] || 0) + total;
      }

      for (const pfId of Object.keys(totalsByPF)) {
        const qtyToDeduct = totalsByPF[pfId];
        const { data: pf } = await supabase
          .from('סוגי_פטיפורים')
          .select('שם_פטיפור, כמות_במלאי')
          .eq('id', pfId)
          .single();
        if (!pf) continue;
        const before = Number(pf.כמות_במלאי) || 0;
        const after  = before - qtyToDeduct; // may go negative — honest ledger, see product loop above
        await supabase
          .from('סוגי_פטיפורים')
          .update({ כמות_במלאי: after })
          .eq('id', pfId);
        await recordStockMovement(supabase, {
          itemKind:    'פטיפור',
          itemId:      pfId,
          itemName:    pf.שם_פטיפור || '',
          before,
          after,
          sourceKind:  'הזמנה',
          sourceId:    orderId,
          notes:       `הורדה ממארז (${qtyToDeduct} יח׳) — יצירת הזמנה פעילה`,
        });
        petitFourTypes++;
      }
    }
  }

  if (productCount === 0 && petitFourTypes === 0) {
    console.log('[inventory] deduction skipped — order has no items. order:', orderId);
    return { deducted: false, reason: 'no_items' };
  }

  console.log('[inventory] deduction completed. order:', orderId, '| products:', productCount, '| petit-four types:', petitFourTypes);
  await logServiceRun(supabase, {
    serviceKey:  'inventory_deduction',
    action:      'deduct_order',
    status:      'success',
    relatedType: 'order',
    relatedId:   orderId,
    message:     `מוצרים: ${productCount} · פטיפורים: ${petitFourTypes}`,
    metadata:    { productCount, petitFourTypes, trigger: 'order_active' },
  });
  void logActivity({
    module:      'inventory',
    action:      'inventory_deducted',
    status:      'success',
    entityType:  'order',
    entityId:    orderId,
    title:       'ירד מלאי על יצירת הזמנה פעילה',
    description: `מוצרים: ${productCount} · פטיפורים: ${petitFourTypes}`,
    metadata:    { productCount, petitFourTypes, trigger: 'order_active' },
    serviceKey:  'inventory_deduction',
  });
  return { deducted: true, productCount, petitFourTypes };
}

// ─── Public API — restoration (on cancellation) ─────────────────────────────

/**
 * Restore an order's items back to stock. Idempotent: re-running on an
 * order whose net is already ≤ 0 (never deducted, or already restored)
 * is a no-op.
 *
 * Source of truth for "how much to restore": the ledger itself
 * (Σיציאה − Σכניסה per item, filtered to this order). NOT the order's
 * current line items — those may have been edited between the deduction
 * and the cancellation.
 *
 * Trigger sites: order status → 'בוטלה' (PATCH /api/orders/[id] and
 * bulk update_status). σאטמר orders never reach here because they
 * never deducted in the first place — but the helper is harmless for
 * them: net would be 0 and it'd no-op.
 */
export async function restoreOrderInventory(
  supabase: AnySupabase,
  orderId: string,
): Promise<RestoreResult> {
  const gate = await commonGate(supabase, orderId, 'restoration');
  if (!gate.enabled) return { restored: false, reason: gate.reason || 'flag_off' };

  const ledger = await loadOrderLedgerNet(supabase, orderId);
  if (ledger.fetchFailed) return { restored: false, reason: 'fetch_failed' };
  if (ledger.totalNet <= 0) {
    console.log('[inventory] restoration skipped — nothing to restore (net ≤ 0). order:', orderId, '| net:', ledger.totalNet);
    return { restored: false, reason: 'not_currently_deducted' };
  }

  console.log('[inventory] restoring because order was cancelled. order:', orderId, '| net to restore:', ledger.totalNet);

  let productCount   = 0;
  let petitFourTypes = 0;

  for (const [itemId, info] of Array.from(ledger.byItem.entries())) {
    if (info.net <= 0) continue; // already balanced for this item

    const table = info.kind === 'מוצר'    ? 'מוצרים_למכירה'
               : info.kind === 'פטיפור'   ? 'סוגי_פטיפורים'
               : info.kind === 'חומר_גלם' ? 'מלאי_חומרי_גלם'
               : null;
    if (!table) {
      console.warn('[inventory] restore — unknown item kind:', info.kind, '| order:', orderId, '| item:', itemId);
      continue;
    }
    const nameCol = info.kind === 'מוצר'    ? 'שם_מוצר'
                  : info.kind === 'פטיפור'   ? 'שם_פטיפור'
                  : 'שם_חומר_גלם';

    const { data: row } = await supabase
      .from(table)
      .select(`${nameCol}, כמות_במלאי`)
      .eq('id', itemId)
      .single();
    if (!row) {
      console.warn('[inventory] restore — item disappeared:', itemId, '| order:', orderId);
      continue;
    }

    type ItemRow = { כמות_במלאי?: number | null; [key: string]: unknown };
    const r       = row as ItemRow;
    const before  = Number(r.כמות_במלאי) || 0;
    const after   = before + info.net;
    const itemNm  = (r[nameCol] as string | null | undefined) || info.name || '';

    await supabase.from(table).update({ כמות_במלאי: after }).eq('id', itemId);
    await recordStockMovement(supabase, {
      itemKind:     info.kind as 'מוצר' | 'פטיפור' | 'חומר_גלם',
      itemId,
      itemName:     itemNm,
      before,
      after,
      sourceKind:   'הזמנה',
      sourceId:     orderId,
      notes:        'החזרת מלאי — הזמנה בוטלה',
      movementKind: 'כניסה',
    });

    if (info.kind === 'מוצר')         productCount++;
    else if (info.kind === 'פטיפור')  petitFourTypes++;
  }

  if (productCount === 0 && petitFourTypes === 0) {
    console.log('[inventory] restoration completed with zero per-item updates. order:', orderId);
    return { restored: false, reason: 'no_items' };
  }

  console.log('[inventory] restoration completed. order:', orderId, '| products:', productCount, '| petit-four types:', petitFourTypes);
  await logServiceRun(supabase, {
    serviceKey:  'inventory_deduction',
    action:      'restore_order',
    status:      'success',
    relatedType: 'order',
    relatedId:   orderId,
    message:     `מוצרים: ${productCount} · פטיפורים: ${petitFourTypes}`,
    metadata:    { productCount, petitFourTypes, trigger: 'order_cancelled' },
  });
  void logActivity({
    module:      'inventory',
    action:      'inventory_restored',
    status:      'success',
    entityType:  'order',
    entityId:    orderId,
    title:       'החזרת מלאי — הזמנה בוטלה',
    description: `מוצרים: ${productCount} · פטיפורים: ${petitFourTypes}`,
    metadata:    { productCount, petitFourTypes, trigger: 'order_cancelled' },
    serviceKey:  'inventory_deduction',
  });
  return { restored: true, productCount, petitFourTypes };
}

// ─── Public API — reconciliation (on order-items edit) ──────────────────────

// Statuses eligible for reconciliation — mirrors the backfill tool's
// ACTIVE_ORDER_STATUSES. Drafts never deduct; cancelled orders are handled
// by the restore path; completed orders are only *adjusted* (net > 0), never
// deducted from scratch (their stock was long since counted manually).
const RECONCILE_ACTIVE_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'];

/**
 * Bring the ledger (and stock) in line with the order's CURRENT items.
 *
 * Called after the items of an order are replaced (PUT /api/orders/[id]/items).
 * For each product / petit-four we compare:
 *
 *     desired = quantity in the order right now
 *     net     = Σיציאה − Σכניסה already in the ledger for this order
 *
 * and apply only the delta: extra יציאה when the order grew, כניסה when it
 * shrank or an item was removed. Idempotent — running it twice in a row
 * finds delta 0 everywhere and does nothing.
 *
 * Eligibility (checked here, not by the caller):
 *   • סאטמר orders   → never touch stock (existing business rule).
 *   • טיוטה / בוטלה  → no-op (draft never deducted; cancel path restores).
 *   • active statuses → full reconcile (an active order with net=0 gets a
 *     full deduction — same thing the admin backfill would do).
 *   • הושלמה בהצלחה  → adjust only if currently deducted (net > 0).
 */
export async function reconcileOrderInventory(
  supabase: AnySupabase,
  orderId: string,
): Promise<ReconcileResult> {
  const gate = await commonGate(supabase, orderId, 'reconciliation');
  if (!gate.enabled) return { reconciled: false, reason: 'flag_off' };

  const { data: order, error: orderErr } = await supabase
    .from('הזמנות')
    .select('סטטוס_הזמנה, סוג_הזמנה')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) {
    console.error('[inventory] reconcile — order fetch failed. order:', orderId, '| error:', orderErr?.message);
    return { reconciled: false, reason: 'fetch_failed' };
  }
  if (order.סוג_הזמנה === 'סאטמר') {
    return { reconciled: false, reason: 'not_applicable' };
  }

  const ledger = await loadOrderLedgerNet(supabase, orderId);
  if (ledger.fetchFailed) return { reconciled: false, reason: 'fetch_failed' };

  const status      = order.סטטוס_הזמנה as string;
  const isActive    = RECONCILE_ACTIVE_STATUSES.includes(status);
  const isCompleted = status === 'הושלמה בהצלחה';
  if (!isActive && !(isCompleted && ledger.totalNet > 0)) {
    console.log('[inventory] reconcile skipped — not applicable. order:', orderId, '| status:', status, '| net:', ledger.totalNet);
    return { reconciled: false, reason: 'not_applicable' };
  }

  // ── Desired quantities from the order's CURRENT items ────────────────────
  const desired = new Map<string, { kind: 'מוצר' | 'פטיפור'; qty: number }>();

  const { data: items, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('מוצר_id, כמות')
    .eq('הזמנה_id', orderId)
    .eq('סוג_שורה', 'מוצר');
  if (itemsErr) {
    console.error('[inventory] reconcile — fetch product lines failed. order:', orderId, '| error:', itemsErr.message);
    return { reconciled: false, reason: 'fetch_failed' };
  }
  for (const item of (items ?? []) as Array<{ מוצר_id: string | null; כמות: number | null }>) {
    if (!item.מוצר_id) continue;
    const qty = Number(item.כמות) || 0;
    if (qty <= 0) continue;
    const cur = desired.get(item.מוצר_id);
    desired.set(item.מוצר_id, { kind: 'מוצר', qty: (cur?.qty || 0) + qty });
  }

  const { data: packageLines, error: pkgErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('id, כמות')
    .eq('הזמנה_id', orderId)
    .eq('סוג_שורה', 'מארז');
  if (pkgErr) {
    console.error('[inventory] reconcile — fetch package lines failed. order:', orderId, '| error:', pkgErr.message);
    return { reconciled: false, reason: 'fetch_failed' };
  }
  const pkgRows = (packageLines ?? []) as Array<{ id: string; כמות: number | null }>;
  if (pkgRows.length > 0) {
    const packageQtyByLine: Record<string, number> = {};
    for (const pl of pkgRows) packageQtyByLine[pl.id] = pl.כמות || 1;
    const { data: selections, error: selErr } = await supabase
      .from('בחירת_פטיפורים_בהזמנה')
      .select('שורת_הזמנה_id, פטיפור_id, כמות')
      .in('שורת_הזמנה_id', pkgRows.map(p => p.id));
    if (selErr) {
      console.error('[inventory] reconcile — fetch petit-four selections failed. order:', orderId, '| error:', selErr.message);
      return { reconciled: false, reason: 'fetch_failed' };
    }
    for (const sel of (selections ?? []) as Array<{ שורת_הזמנה_id: string; פטיפור_id: string | null; כמות: number | null }>) {
      if (!sel.פטיפור_id) continue;
      const total = (sel.כמות || 0) * (packageQtyByLine[sel.שורת_הזמנה_id] || 1);
      if (total <= 0) continue;
      const cur = desired.get(sel.פטיפור_id);
      desired.set(sel.פטיפור_id, { kind: 'פטיפור', qty: (cur?.qty || 0) + total });
    }
  }

  // ── Apply per-item delta (desired − ledger net) ───────────────────────────
  const allItemIds = new Set<string>([...Array.from(desired.keys()), ...Array.from(ledger.byItem.keys())]);
  let adjusted = 0;

  for (const itemId of Array.from(allItemIds)) {
    const want   = desired.get(itemId);
    const led    = ledger.byItem.get(itemId);
    const target = want?.qty ?? 0;
    const net    = led?.net ?? 0;
    const delta  = target - net; // >0 → deduct more; <0 → give back
    if (delta === 0) continue;

    const kind = want?.kind ?? led?.kind;
    if (kind !== 'מוצר' && kind !== 'פטיפור') {
      // חומר_גלם rows can only come from manual ledger entries — never from
      // order items, so we have no "desired" to reconcile against. Skip.
      continue;
    }
    const table   = kind === 'מוצר' ? 'מוצרים_למכירה' : 'סוגי_פטיפורים';
    const nameCol = kind === 'מוצר' ? 'שם_מוצר' : 'שם_פטיפור';

    const { data: row } = await supabase
      .from(table)
      .select(`${nameCol}, כמות_במלאי`)
      .eq('id', itemId)
      .single();
    if (!row) {
      console.warn('[inventory] reconcile — item not found in catalog, skipping:', itemId, '| order:', orderId);
      continue;
    }
    type ItemRow = { כמות_במלאי?: number | null; [key: string]: unknown };
    const r      = row as ItemRow;
    const before = Number(r.כמות_במלאי) || 0;
    const after  = before - delta; // no clamping — negative stock is honest
    const name   = (r[nameCol] as string | null | undefined) || led?.name || '';

    const { error: updErr } = await supabase.from(table).update({ כמות_במלאי: after }).eq('id', itemId);
    if (updErr) {
      console.error('[inventory] reconcile — stock update failed:', updErr.message, '| item:', itemId, '| order:', orderId);
      continue; // don't record a movement for a change that didn't happen
    }
    await recordStockMovement(supabase, {
      itemKind:     kind,
      itemId,
      itemName:     name,
      before,
      after,
      sourceKind:   'הזמנה',
      sourceId:     orderId,
      notes:        `התאמת מלאי — עריכת פריטי הזמנה (${delta > 0 ? 'תוספת' : 'החזרה'} ${Math.abs(delta)})`,
      movementKind: delta > 0 ? 'יציאה' : 'כניסה',
    });
    adjusted++;
  }

  if (adjusted === 0) {
    console.log('[inventory] reconcile — no changes needed. order:', orderId);
    return { reconciled: false, reason: 'no_changes' };
  }

  console.log('[inventory] reconcile completed. order:', orderId, '| adjusted items:', adjusted);
  await logServiceRun(supabase, {
    serviceKey:  'inventory_deduction',
    action:      'reconcile_order',
    status:      'success',
    relatedType: 'order',
    relatedId:   orderId,
    message:     `פריטים שהותאמו: ${adjusted}`,
    metadata:    { adjustedItems: adjusted, trigger: 'order_items_edited' },
  });
  void logActivity({
    module:      'inventory',
    action:      'inventory_reconciled',
    status:      'success',
    entityType:  'order',
    entityId:    orderId,
    title:       'התאמת מלאי — פריטי הזמנה נערכו',
    description: `פריטים שהותאמו: ${adjusted}`,
    metadata:    { adjustedItems: adjusted, trigger: 'order_items_edited' },
    serviceKey:  'inventory_deduction',
  });
  return { reconciled: true, adjustedItems: adjusted };
}

// ─── Public API — pre-commit availability guard ─────────────────────────────
//
// Owner policy (Sep 2026): a product/petit-four with insufficient stock
// cannot be put on a real order at all — not "deduct anyway and go
// negative". This is a distinct, opt-outable check from the deduction
// above: deduction (and its reconcile counterpart) record what happened;
// this guard decides whether the commit is allowed to happen in the first
// place. Gated by its own control-center service (order_stock_guard) so it
// can be switched off instantly if it misfires, without touching the
// deduction policy.
//
// Call sites: create-full (non-draft only), finalize-draft, and
// PUT /api/orders/[id]/items — all BEFORE any destructive write, so a
// shortage never leaves a half-mutated order.

export interface StockAvailabilityItem {
  kind: 'מוצר' | 'פטיפור';
  id:   string;
  qty:  number;
}

export interface StockShortage {
  kind:      'מוצר' | 'פטיפור';
  id:        string;
  name:      string;
  requested: number;
  available: number;
}

export type StockAvailabilityResult =
  | { ok: true }
  | { ok: false; shortages: StockShortage[] };

/**
 * Checks whether `items` (already aggregated per id — duplicates are
 * summed defensively anyway) can be fully satisfied by current stock.
 *
 * `orderId`, when given, means the order may already hold a ledger
 * reservation for some of these items (e.g. editing an order that was
 * already deducted) — that reserved amount is added back to "available"
 * so keeping the same quantity never trips the guard, only an actual
 * increase beyond what's on hand does. Pass null for a brand-new order
 * (nothing reserved yet).
 *
 * Fails open (returns ok:true) when: orderType is סאטמר (existing
 * business rule — never gated by stock), the order_stock_guard service is
 * OFF in the control center, or there are no items to check.
 */
export async function checkOrderStockAvailability(
  supabase: AnySupabase,
  args: {
    orderType: string | null | undefined;
    orderId:   string | null;
    items:     StockAvailabilityItem[];
  },
): Promise<StockAvailabilityResult> {
  if (args.orderType === 'סאטמר') return { ok: true };

  const enabled = await isServiceEnabled(supabase, 'order_stock_guard');
  if (!enabled) {
    console.log('[inventory] stock-availability guard skipped — service "order_stock_guard" is OFF in control center.');
    return { ok: true };
  }

  const desired = new Map<string, { kind: 'מוצר' | 'פטיפור'; qty: number }>();
  for (const it of args.items) {
    if (!it.id || !(it.qty > 0)) continue;
    const cur = desired.get(it.id);
    desired.set(it.id, { kind: it.kind, qty: (cur?.qty || 0) + it.qty });
  }
  if (desired.size === 0) return { ok: true };

  let netByItem = new Map<string, number>();
  if (args.orderId) {
    const ledger = await loadOrderLedgerNet(supabase, args.orderId);
    if (!ledger.fetchFailed) {
      netByItem = new Map(Array.from(ledger.byItem.entries()).map(([id, info]) => [id, info.net]));
    }
  }

  const productIds = Array.from(desired.entries()).filter(([, v]) => v.kind === 'מוצר').map(([id]) => id);
  const pfIds      = Array.from(desired.entries()).filter(([, v]) => v.kind === 'פטיפור').map(([id]) => id);

  const stockById = new Map<string, { name: string; stock: number }>();
  if (productIds.length > 0) {
    const { data } = await supabase.from('מוצרים_למכירה').select('id, שם_מוצר, כמות_במלאי').in('id', productIds);
    for (const row of (data ?? []) as Array<{ id: string; שם_מוצר: string | null; כמות_במלאי: number | null }>) {
      stockById.set(row.id, { name: row.שם_מוצר || '', stock: Number(row.כמות_במלאי) || 0 });
    }
  }
  if (pfIds.length > 0) {
    const { data } = await supabase.from('סוגי_פטיפורים').select('id, שם_פטיפור, כמות_במלאי').in('id', pfIds);
    for (const row of (data ?? []) as Array<{ id: string; שם_פטיפור: string | null; כמות_במלאי: number | null }>) {
      stockById.set(row.id, { name: row.שם_פטיפור || '', stock: Number(row.כמות_במלאי) || 0 });
    }
  }

  const shortages: StockShortage[] = [];
  for (const [id, want] of Array.from(desired.entries())) {
    const catalog = stockById.get(id);
    // Unknown / archived id — existing per-route validation already lets
    // these through (e.g. editing an order that references a deleted
    // product); nothing to check stock against, so don't block here.
    if (!catalog) continue;
    const alreadyReserved = netByItem.get(id) || 0;
    const available = catalog.stock + alreadyReserved;
    if (want.qty > available) {
      shortages.push({ kind: want.kind, id, name: catalog.name, requested: want.qty, available });
    }
  }

  return shortages.length === 0 ? { ok: true } : { ok: false, shortages };
}

/** Formats shortages into one Hebrew message for API error responses. */
export function formatStockShortageMessage(shortages: StockShortage[]): string {
  return shortages
    .map(s => `${s.name || s.id}: התבקשו ${s.requested}, זמינים ${Math.max(0, s.available)}`)
    .join(' · ');
}
