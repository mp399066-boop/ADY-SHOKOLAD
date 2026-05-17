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
    const before = Number(product.כמות_במלאי) || 0;
    const after  = Math.max(0, before - Number(item.כמות));
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
        const after  = Math.max(0, before - qtyToDeduct);
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
