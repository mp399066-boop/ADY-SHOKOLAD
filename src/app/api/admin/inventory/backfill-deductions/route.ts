export const dynamic = 'force-dynamic';

// POST /api/admin/inventory/backfill-deductions
//
// One-shot repair for paid orders that bypassed inventory deduction —
// the historical situation where a code path (e.g. the old bulk
// update_payment_status) flipped סטטוס_תשלום to 'שולם' without calling
// deductOrderInventory. Each call here goes through the same idempotent
// helper, so:
//   • orders that already have a תנועות_מלאי 'יציאה' row are a no-op
//   • orders missing the ledger get a proper deduction + ledger row
//
// Two usage modes:
//   1. dry_run = true   → only reports what WOULD be deducted, no writes
//   2. dry_run = false  → actually performs the deduction
//
// Both modes accept an optional `order_ids: string[]` to limit scope.
// Without `order_ids`, the route scans every order with סטטוס_תשלום='שולם'
// AND סוג_הזמנה != 'סאטמר' that has NO 'יציאה' movement in תנועות_מלאי.
// That's the canonical "needs backfill" set.
//
// Admin-only (requireAdminUser, not management). The destructive form
// also writes one activity_log row per processed order so the operator
// can see exactly what was changed.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenAdminResponse } from '@/lib/auth/requireAuthorizedUser';
import { deductOrderInventory, type DeductionResult } from '@/lib/inventory-deduct';

interface BackfillBody {
  dry_run?:    boolean;
  order_ids?:  string[];
  // When true (only meaningful with dry_run), the preview rows are
  // enriched with customer name + a per-order item list (product name +
  // quantity + petit-four totals for packages). The UI uses this to
  // show the operator exactly what's about to be deducted.
  detailed?:   boolean;
}

interface DetailedPreviewRow {
  order_id:       string;
  order_number:   string | null;
  customer_name:  string | null;
  payment_status: string | null;
  items: Array<{
    name:     string;
    quantity: number;
    kind:     'product' | 'package';
    // For packages: per-type petit-four totals (qty in *this* line, after
    // multiplying selection.qty × package.qty).
    petit_fours?: Array<{ name: string; quantity: number }>;
  }>;
}

interface OrderProcessResult {
  order_id:     string;
  order_number: string | null;
  payment_status: string | null;
  result:       'deducted' | 'already_deducted' | 'no_items' | 'fetch_failed' | 'flag_off' | 'error';
  product_count?: number;
  petit_four_types?: number;
  error?:       string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenAdminResponse();

  let body: BackfillBody = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — default to scan-all + dry-run.
    body = {};
  }
  const dryRun       = body.dry_run !== false; // default TRUE (safe)
  const detailed     = body.detailed === true;
  const explicitIds  = Array.isArray(body.order_ids) ? body.order_ids.filter(Boolean) : null;

  const supabase = createAdminClient();
  console.log('[backfill-deductions] called by', auth.email, '| dry_run:', dryRun, '| explicit_ids:', explicitIds?.length ?? 'none');

  // Step 1 — find candidate orders (either explicit list or full scan).
  let candidateIds: string[] = [];
  if (explicitIds && explicitIds.length > 0) {
    candidateIds = explicitIds;
  } else {
    const { data: paidRows, error: paidErr } = await supabase
      .from('הזמנות')
      .select('id')
      .eq('סטטוס_תשלום', 'שולם')
      .neq('סוג_הזמנה', 'סאטמר');
    if (paidErr) {
      console.error('[backfill-deductions] paid-orders query failed:', paidErr.message);
      return NextResponse.json({ error: paidErr.message }, { status: 500 });
    }
    candidateIds = (paidRows ?? []).map((r: { id: string }) => r.id);
  }
  console.log('[backfill-deductions] candidates:', candidateIds.length);

  if (candidateIds.length === 0) {
    return NextResponse.json({ ok: true, dry_run: dryRun, total: 0, processed: 0, results: [] });
  }

  // Step 2 — narrow to orders missing any 'יציאה' movement.
  const { data: movementRows, error: movErr } = await supabase
    .from('תנועות_מלאי')
    .select('מזהה_מקור')
    .eq('סוג_מקור', 'הזמנה')
    .eq('סוג_תנועה', 'יציאה')
    .in('מזהה_מקור', candidateIds);
  if (movErr) {
    console.error('[backfill-deductions] movements lookup failed:', movErr.message);
    return NextResponse.json({ error: movErr.message }, { status: 500 });
  }
  const alreadyDeducted = new Set(
    ((movementRows ?? []) as Array<{ מזהה_מקור: string }>).map(r => r.מזהה_מקור),
  );
  const needsDeduction = candidateIds.filter(id => !alreadyDeducted.has(id));
  console.log('[backfill-deductions] missing ledger:', needsDeduction.length, '| already deducted:', alreadyDeducted.size);

  // Step 3 — fetch metadata for the report.
  const { data: orderMeta } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, סטטוס_תשלום')
    .in('id', candidateIds);
  const metaById = new Map(
    ((orderMeta ?? []) as Array<{ id: string; מספר_הזמנה: string | null; סטטוס_תשלום: string | null }>)
      .map(r => [r.id, r]),
  );

  // Dry-run summary.
  if (dryRun) {
    // Minimal preview by default — cheap, no extra joins.
    if (!detailed || needsDeduction.length === 0) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        total: candidateIds.length,
        missing_ledger: needsDeduction.length,
        already_deducted: alreadyDeducted.size,
        preview: needsDeduction.map(id => ({
          order_id:       id,
          order_number:   metaById.get(id)?.מספר_הזמנה ?? null,
          payment_status: metaById.get(id)?.סטטוס_תשלום ?? null,
        })),
      });
    }

    // Detailed preview — enriches each missing order with customer +
    // items so the operator sees exactly what's about to be deducted.
    // Two extra queries (orders+customer, items+products+petit-fours).
    const { data: detailedOrders } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, סטטוס_תשלום, לקוחות(שם_פרטי, שם_משפחה)')
      .in('id', needsDeduction);

    const { data: itemRows } = await supabase
      .from('מוצרים_בהזמנה')
      .select(`
        id, הזמנה_id, סוג_שורה, גודל_מארז, כמות,
        מוצרים_למכירה(שם_מוצר),
        בחירת_פטיפורים_בהזמנה(כמות, סוגי_פטיפורים(שם_פטיפור))
      `)
      .in('הזמנה_id', needsDeduction);

    type DOrder = { id: string; מספר_הזמנה: string | null; סטטוס_תשלום: string | null; לקוחות?: { שם_פרטי?: string | null; שם_משפחה?: string | null } | null };
    type DItem  = {
      הזמנה_id: string;
      סוג_שורה: string | null;
      גודל_מארז: number | null;
      כמות: number | null;
      מוצרים_למכירה?: { שם_מוצר?: string | null } | null;
      בחירת_פטיפורים_בהזמנה?: Array<{ כמות: number | null; סוגי_פטיפורים?: { שם_פטיפור?: string | null } | null }> | null;
    };

    const orderById = new Map<string, DOrder>(((detailedOrders ?? []) as DOrder[]).map(o => [o.id, o]));
    const itemsByOrder = new Map<string, DItem[]>();
    for (const it of (itemRows ?? []) as DItem[]) {
      const list = itemsByOrder.get(it.הזמנה_id) ?? [];
      list.push(it);
      itemsByOrder.set(it.הזמנה_id, list);
    }

    const preview: DetailedPreviewRow[] = needsDeduction.map(id => {
      const o = orderById.get(id);
      const cust = o?.לקוחות;
      const customerName = cust
        ? `${(cust.שם_פרטי || '').trim()} ${(cust.שם_משפחה || '').trim()}`.trim()
        : null;

      const items = (itemsByOrder.get(id) ?? []).map(it => {
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
          name: it.מוצרים_למכירה?.שם_מוצר?.trim() || 'פריט',
          quantity: qty,
          kind: 'product' as const,
        };
      });

      return {
        order_id:       id,
        order_number:   o?.מספר_הזמנה ?? null,
        customer_name:  customerName || null,
        payment_status: o?.סטטוס_תשלום ?? null,
        items,
      };
    });

    return NextResponse.json({
      ok: true,
      dry_run: true,
      detailed: true,
      total: candidateIds.length,
      missing_ledger: needsDeduction.length,
      already_deducted: alreadyDeducted.size,
      preview,
    });
  }

  // Step 4 — actually run the deduction for orders missing the ledger.
  const results: OrderProcessResult[] = [];
  let succeeded = 0;
  let errored   = 0;
  for (const id of needsDeduction) {
    try {
      const r: DeductionResult = await deductOrderInventory(supabase, id);
      const meta = metaById.get(id);
      if (r.deducted) {
        succeeded++;
        results.push({
          order_id:        id,
          order_number:    meta?.מספר_הזמנה ?? null,
          payment_status:  meta?.סטטוס_תשלום ?? null,
          result:          'deducted',
          product_count:   r.productCount,
          petit_four_types: r.petitFourTypes,
        });
      } else {
        results.push({
          order_id:       id,
          order_number:   meta?.מספר_הזמנה ?? null,
          payment_status: meta?.סטטוס_תשלום ?? null,
          result:         r.reason,
        });
      }
    } catch (err) {
      errored++;
      const meta = metaById.get(id);
      const message = err instanceof Error ? err.message : String(err);
      console.error('[backfill-deductions] order', id, 'failed:', message);
      results.push({
        order_id:       id,
        order_number:   meta?.מספר_הזמנה ?? null,
        payment_status: meta?.סטטוס_תשלום ?? null,
        result:         'error',
        error:          message,
      });
    }
  }

  console.log('[backfill-deductions] done — succeeded:', succeeded, '| errored:', errored, '| skipped (already deducted):', alreadyDeducted.size);

  return NextResponse.json({
    ok: true,
    dry_run: false,
    total: candidateIds.length,
    missing_ledger: needsDeduction.length,
    already_deducted: alreadyDeducted.size,
    succeeded,
    errored,
    results,
  });
}
