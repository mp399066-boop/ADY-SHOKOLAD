export const dynamic = 'force-dynamic';

// POST /api/admin/inventory/backfill-deductions
//
// Two-direction repair tool for inventory ledger drift.
// Used by Settings → תיקון מלאי (admin-only).
//
// Scans for two things:
//
//   1. Orders that SHOULD have a deduction but don't have one yet.
//      Definition: status ∈ {חדשה, בהכנה, מוכנה למשלוח, נשלחה}
//                  AND סוג_הזמנה != 'סאטמר'
//                  AND no net יציאה in תנועות_מלאי for this order.
//      Caused by: old payment-triggered policy left active-unpaid orders
//      un-deducted; future code paths that forget to call the helper.
//
//   2. Orders that SHOULD have stock restored but don't.
//      Definition: status = 'בוטלה'
//                  AND סוג_הזמנה != 'סאטמר'
//                  AND net יציאה > 0 (still has stock taken from inventory).
//      Caused by: cancelled-after-deduction without going through the new
//      cancel-trigger restore path (e.g. direct Supabase Studio edit, or
//      cancelled before the restore code shipped).
//
// Each call runs the existing idempotent helpers (deductOrderInventory /
// restoreOrderInventory) — re-running this endpoint is always safe.
//
// Body shape:
//   {
//     dry_run?:    boolean       // default true (safe)
//     detailed?:   boolean       // default false — enriches preview with
//                                //   customer + items per missing order
//     order_ids?:  string[]      // optional explicit scope; without it,
//                                //   the full scan in both directions runs
//     mode?: 'deduct' | 'restore' | 'both'  // default 'both'
//   }
//
// Response (dry-run, detailed):
//   {
//     ok, dry_run, mode, todayISO,
//     deduct: { missing_count, items: [{order_id, order_number, customer_name,
//                                        items: [{name, quantity, kind, petit_fours?}]}] },
//     restore: { missing_count, items: [{order_id, order_number, customer_name,
//                                         cancelled_at, items: [...same shape...]}] },
//   }

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenAdminResponse } from '@/lib/auth/requireAuthorizedUser';
import {
  deductOrderInventory,
  restoreOrderInventory,
  type DeductionResult,
  type RestoreResult,
} from '@/lib/inventory-deduct';

const ACTIVE_ORDER_STATUSES   = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'] as const;
const CANCELLED_ORDER_STATUS  = 'בוטלה';

type Mode = 'deduct' | 'restore' | 'both';

interface BackfillBody {
  dry_run?:   boolean;
  detailed?:  boolean;
  order_ids?: string[];
  mode?:      Mode;
}

interface PreviewItem {
  name:     string;
  quantity: number;
  kind:     'product' | 'package';
  petit_fours?: Array<{ name: string; quantity: number }>;
}
interface PreviewRow {
  order_id:       string;
  order_number:   string | null;
  customer_name:  string | null;
  payment_status: string | null;
  order_status:   string | null;
  items:          PreviewItem[];
}
interface RunResultRow {
  order_id:        string;
  order_number:    string | null;
  direction:       'deduct' | 'restore';
  result:          'deducted' | 'restored' | 'already_done' | 'no_items' | 'fetch_failed' | 'flag_off' | 'satmar' | 'error';
  product_count?:  number;
  petit_four_types?: number;
  error?:          string;
}

// ── Helper: per-order net יציאה - כניסה ─────────────────────────────────────
async function netByOrder(
  supabase: ReturnType<typeof createAdminClient>,
  orderIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (orderIds.length === 0) return result;
  const { data: movementRows } = await supabase
    .from('תנועות_מלאי')
    .select('מזהה_מקור, סוג_תנועה, כמות')
    .eq('סוג_מקור', 'הזמנה')
    .in('מזהה_מקור', orderIds);
  for (const row of (movementRows ?? []) as Array<{ מזהה_מקור: string; סוג_תנועה: string; כמות: number | null }>) {
    const cur  = result.get(row.מזהה_מקור) ?? 0;
    const qty  = Number(row.כמות || 0);
    const sign = row.סוג_תנועה === 'יציאה' ? +1
              : row.סוג_תנועה === 'כניסה' ? -1
              : 0;
    result.set(row.מזהה_מקור, cur + sign * qty);
  }
  return result;
}

// ── Helper: enrich preview rows with customer + items ───────────────────────
async function buildDetailedPreview(
  supabase: ReturnType<typeof createAdminClient>,
  orderIds: string[],
): Promise<Map<string, Omit<PreviewRow, 'order_id'>>> {
  const result = new Map<string, Omit<PreviewRow, 'order_id'>>();
  if (orderIds.length === 0) return result;

  const { data: orders } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, סטטוס_תשלום, סטטוס_הזמנה, לקוחות(שם_פרטי, שם_משפחה)')
    .in('id', orderIds);

  const { data: itemRows } = await supabase
    .from('מוצרים_בהזמנה')
    .select(`
      הזמנה_id, סוג_שורה, גודל_מארז, כמות,
      מוצרים_למכירה(שם_מוצר),
      בחירת_פטיפורים_בהזמנה(כמות, סוגי_פטיפורים(שם_פטיפור))
    `)
    .in('הזמנה_id', orderIds);

  type DOrder = {
    id:           string;
    מספר_הזמנה:  string | null;
    סטטוס_תשלום: string | null;
    סטטוס_הזמנה: string | null;
    לקוחות?:     { שם_פרטי?: string | null; שם_משפחה?: string | null } | null;
  };
  type DItem = {
    הזמנה_id:   string;
    סוג_שורה:   string | null;
    גודל_מארז:  number | null;
    כמות:       number | null;
    מוצרים_למכירה?: { שם_מוצר?: string | null } | null;
    בחירת_פטיפורים_בהזמנה?: Array<{ כמות: number | null; סוגי_פטיפורים?: { שם_פטיפור?: string | null } | null }> | null;
  };

  const itemsByOrder = new Map<string, DItem[]>();
  for (const it of (itemRows ?? []) as DItem[]) {
    const list = itemsByOrder.get(it.הזמנה_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.הזמנה_id, list);
  }

  for (const o of (orders ?? []) as DOrder[]) {
    const cust = o.לקוחות;
    const customerName = cust
      ? `${(cust.שם_פרטי || '').trim()} ${(cust.שם_משפחה || '').trim()}`.trim()
      : null;

    const items: PreviewItem[] = (itemsByOrder.get(o.id) ?? []).map(it => {
      const qty = Number(it.כמות || 0);
      if (it.סוג_שורה === 'מארז') {
        const size = it.גודל_מארז ?? 0;
        const pfTotals = (it.בחירת_פטיפורים_בהזמנה ?? [])
          .map(s => ({
            name:     s.סוגי_פטיפורים?.שם_פטיפור?.trim() || '',
            quantity: Number(s.כמות || 0) * qty,
          }))
          .filter(p => p.name && p.quantity > 0);
        return {
          name: size > 0 ? `מארז ${size} פטיפורים` : 'מארז פטיפורים',
          quantity: qty,
          kind: 'package' as const,
          ...(pfTotals.length > 0 ? { petit_fours: pfTotals } : {}),
        };
      }
      return {
        name:     it.מוצרים_למכירה?.שם_מוצר?.trim() || 'פריט',
        quantity: qty,
        kind:     'product' as const,
      };
    });

    result.set(o.id, {
      order_number:   o.מספר_הזמנה,
      customer_name:  customerName || null,
      payment_status: o.סטטוס_תשלום,
      order_status:   o.סטטוס_הזמנה,
      items,
    });
  }

  return result;
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenAdminResponse();

  let body: BackfillBody = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun      = body.dry_run !== false;
  const detailed    = body.detailed === true;
  const explicitIds = Array.isArray(body.order_ids) ? body.order_ids.filter(Boolean) : null;
  const mode: Mode  = body.mode ?? 'both';

  const supabase = createAdminClient();
  console.log('[backfill-deductions] called by', auth.email,
    '| dry_run:', dryRun, '| detailed:', detailed, '| mode:', mode,
    '| explicit_ids:', explicitIds?.length ?? 'none');

  // ── Step 1: find candidate orders for each direction ──────────────────────
  let deductCandidates:  string[] = [];
  let restoreCandidates: string[] = [];

  if (explicitIds && explicitIds.length > 0) {
    // When explicit ids are given, classify each by its current state.
    const { data: rows } = await supabase
      .from('הזמנות')
      .select('id, סטטוס_הזמנה, סוג_הזמנה')
      .in('id', explicitIds);
    for (const r of (rows ?? []) as Array<{ id: string; סטטוס_הזמנה: string; סוג_הזמנה: string | null }>) {
      if (r.סוג_הזמנה === 'סאטמר') continue;
      if (r.סטטוס_הזמנה === CANCELLED_ORDER_STATUS)            restoreCandidates.push(r.id);
      else if ((ACTIVE_ORDER_STATUSES as readonly string[]).includes(r.סטטוס_הזמנה)) deductCandidates.push(r.id);
    }
  } else {
    if (mode === 'deduct' || mode === 'both') {
      const { data } = await supabase
        .from('הזמנות')
        .select('id')
        .in('סטטוס_הזמנה', ACTIVE_ORDER_STATUSES as unknown as string[])
        .neq('סוג_הזמנה', 'סאטמר');
      deductCandidates = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
    }
    if (mode === 'restore' || mode === 'both') {
      const { data } = await supabase
        .from('הזמנות')
        .select('id')
        .eq('סטטוס_הזמנה', CANCELLED_ORDER_STATUS)
        .neq('סוג_הזמנה', 'סאטמר');
      restoreCandidates = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
    }
  }

  // ── Step 2: filter by net ledger ──────────────────────────────────────────
  // Compute net once across all candidate ids; then split.
  const allCandidateIds = Array.from(new Set([...deductCandidates, ...restoreCandidates]));
  const netByOrderId    = await netByOrder(supabase, allCandidateIds);

  // Missing deduction = active order with net <= 0 (never deducted, or fully restored).
  const missingDeduct = deductCandidates.filter(id => (netByOrderId.get(id) ?? 0) <= 0);
  // Missing restore = cancelled order with net > 0 (still has stock taken).
  const missingRestore = restoreCandidates.filter(id => (netByOrderId.get(id) ?? 0) > 0);

  console.log('[backfill-deductions] missing-deduct:', missingDeduct.length,
    '| missing-restore:', missingRestore.length);

  // ── Step 3: dry-run path ──────────────────────────────────────────────────
  if (dryRun) {
    const previewByOrder = detailed
      ? await buildDetailedPreview(supabase, [...missingDeduct, ...missingRestore])
      : new Map<string, Omit<PreviewRow, 'order_id'>>();

    const buildPreview = (ids: string[]): PreviewRow[] =>
      ids.map(id => {
        const enriched = previewByOrder.get(id);
        return enriched
          ? { order_id: id, ...enriched }
          : { order_id: id, order_number: null, customer_name: null, payment_status: null, order_status: null, items: [] };
      });

    return NextResponse.json({
      ok:        true,
      dry_run:   true,
      detailed,
      mode,
      deduct: {
        missing_count: missingDeduct.length,
        items:         buildPreview(missingDeduct),
      },
      restore: {
        missing_count: missingRestore.length,
        items:         buildPreview(missingRestore),
      },
    });
  }

  // ── Step 4: live run ──────────────────────────────────────────────────────
  const results: RunResultRow[] = [];
  let deductedOk = 0;
  let restoredOk = 0;
  let errored    = 0;

  // Get metadata for response rows (single fetch).
  const { data: metaRows } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה')
    .in('id', [...missingDeduct, ...missingRestore]);
  const metaById = new Map<string, { id: string; מספר_הזמנה: string | null }>(
    ((metaRows ?? []) as Array<{ id: string; מספר_הזמנה: string | null }>).map(r => [r.id, r]),
  );

  for (const id of missingDeduct) {
    try {
      const r: DeductionResult = await deductOrderInventory(supabase, id);
      const meta = metaById.get(id);
      if (r.deducted) {
        deductedOk++;
        results.push({
          order_id:         id,
          order_number:     meta?.מספר_הזמנה ?? null,
          direction:        'deduct',
          result:           'deducted',
          product_count:    r.productCount,
          petit_four_types: r.petitFourTypes,
        });
      } else {
        results.push({
          order_id:     id,
          order_number: meta?.מספר_הזמנה ?? null,
          direction:    'deduct',
          result:       r.reason === 'already_deducted' ? 'already_done' : r.reason,
        });
      }
    } catch (err) {
      errored++;
      const meta = metaById.get(id);
      results.push({
        order_id:     id,
        order_number: meta?.מספר_הזמנה ?? null,
        direction:    'deduct',
        result:       'error',
        error:        err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const id of missingRestore) {
    try {
      const r: RestoreResult = await restoreOrderInventory(supabase, id);
      const meta = metaById.get(id);
      if (r.restored) {
        restoredOk++;
        results.push({
          order_id:         id,
          order_number:     meta?.מספר_הזמנה ?? null,
          direction:        'restore',
          result:           'restored',
          product_count:    r.productCount,
          petit_four_types: r.petitFourTypes,
        });
      } else {
        results.push({
          order_id:     id,
          order_number: meta?.מספר_הזמנה ?? null,
          direction:    'restore',
          // The helper's "nothing currently deducted" outcome is the
          // user-facing "already done" — both wording-wise (operator
          // doesn't care that internally there's nothing to undo) and
          // because the row should disappear from the missing-restore
          // list on the next refetch.
          result:       r.reason === 'not_currently_deducted' ? 'already_done' : r.reason,
        });
      }
    } catch (err) {
      errored++;
      const meta = metaById.get(id);
      results.push({
        order_id:     id,
        order_number: meta?.מספר_הזמנה ?? null,
        direction:    'restore',
        result:       'error',
        error:        err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log('[backfill-deductions] done — deducted:', deductedOk,
    '| restored:', restoredOk, '| errored:', errored);

  return NextResponse.json({
    ok:        true,
    dry_run:   false,
    mode,
    deduct:    { processed: missingDeduct.length,  succeeded: deductedOk },
    restore:   { processed: missingRestore.length, succeeded: restoredOk },
    errored,
    results,
  });
}
