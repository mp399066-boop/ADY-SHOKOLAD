// ============================================================================
// Inventory deduction — single source of truth.
//
// Policy (May 2026, owner-driven):
//   Stock drops EXACTLY ONCE per order, when סטטוס_תשלום becomes "שולם" for
//   the first time. Not on סטטוס_הזמנה=בהכנה. Not on document issuance. Not
//   on Morning calls. The reason is operational: customers pre-order a week
//   ahead, and a paid order should immediately make the items unavailable
//   to other buyers.
//
// Idempotency: we use the existing תנועות_מלאי ledger (migration 025) as the
// "this order has already been deducted" marker. Before deducting we query
// for any existing 'יציאה' movement linked to the order; if one exists we
// skip cleanly. This is the mechanism the user explicitly authorised in the
// spec ("טבלת תנועות מלאי" was listed as an acceptable existing marker).
// No new column / migration required.
//
// Feature flags surfaced as exported constants so a policy reversal is a
// one-line change in this file (and the call sites can keep their existing
// trigger code, gated behind the flag instead of deleted).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { recordStockMovement } from '@/lib/inventory-movements';

// ─── Policy switches ────────────────────────────────────────────────────────

// When true, transitioning סטטוס_הזמנה → 'בהכנה' would deduct inventory.
// Owner asked to disable this in favour of payment-driven deduction below.
export const DEDUCT_INVENTORY_ON_ORDER_STATUS = false;

// When true, transitioning סטטוס_תשלום → 'שולם' (first time) deducts.
// This is the active policy.
export const DEDUCT_INVENTORY_ON_PAYMENT_PAID = true;

// ─── Types ──────────────────────────────────────────────────────────────────

// Match the project-wide pattern: typing via the actual createAdminClient
// return type avoids the @supabase parser choking on Hebrew column names
// in .select() (which happens when SupabaseClient is imported bare).
type AnySupabase = ReturnType<typeof createAdminClient>;

export type DeductionResult =
  | { deducted: true;  productCount: number; petitFourTypes: number }
  | { deducted: false; reason: 'already_deducted' | 'no_items' | 'fetch_failed' | 'flag_off' };

// ─── Public API ─────────────────────────────────────────────────────────────

// Idempotent deduction. Safe to call multiple times for the same order —
// after the first successful run, subsequent calls return
// { deducted: false, reason: 'already_deducted' } without touching stock.
export async function deductOrderInventory(
  supabase: AnySupabase,
  orderId: string,
): Promise<DeductionResult> {
  if (!DEDUCT_INVENTORY_ON_PAYMENT_PAID) {
    console.log('[inventory] deduction skipped — DEDUCT_INVENTORY_ON_PAYMENT_PAID is false. order:', orderId);
    return { deducted: false, reason: 'flag_off' };
  }

  // ── Idempotency check ──────────────────────────────────────────────────
  // Any 'יציאה' movement for this order means we've already deducted.
  // Index `תנועות_מלאי_מקור_idx` makes this lookup cheap.
  const { data: existingMovement, error: lookupErr } = await supabase
    .from('תנועות_מלאי')
    .select('id')
    .eq('סוג_מקור', 'הזמנה')
    .eq('מזהה_מקור', orderId)
    .eq('סוג_תנועה', 'יציאה')
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    // Don't risk a double-deduction if we can't even read the ledger —
    // bail out and log so the operator can investigate.
    console.error('[inventory] idempotency lookup failed — refusing to deduct. order:', orderId, '| error:', lookupErr.message);
    return { deducted: false, reason: 'fetch_failed' };
  }

  if (existingMovement) {
    console.log('[inventory] deduction skipped — already deducted. order:', orderId, '| existing movement id:', existingMovement.id);
    return { deducted: false, reason: 'already_deducted' };
  }

  console.log('[inventory] deducting inventory because payment is paid. order:', orderId);

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
    const after = Math.max(0, before - Number(item.כמות));
    await supabase
      .from('מוצרים_למכירה')
      .update({ כמות_במלאי: after })
      .eq('id', item.מוצר_id);
    await recordStockMovement(supabase, {
      itemKind: 'מוצר',
      itemId:   item.מוצר_id,
      itemName: product.שם_מוצר || '',
      before,
      after,
      sourceKind: 'הזמנה',
      sourceId:   orderId,
      notes:      'הורדה אוטומטית במעבר לשולם',
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
        const after = Math.max(0, before - qtyToDeduct);
        await supabase
          .from('סוגי_פטיפורים')
          .update({ כמות_במלאי: after })
          .eq('id', pfId);
        await recordStockMovement(supabase, {
          itemKind: 'פטיפור',
          itemId:   pfId,
          itemName: pf.שם_פטיפור || '',
          before,
          after,
          sourceKind: 'הזמנה',
          sourceId:   orderId,
          notes:      `הורדה ממארז (${qtyToDeduct} יח׳) — תשלום שולם`,
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
  return { deducted: true, productCount, petitFourTypes };
}
