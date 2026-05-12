import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { sendSatmarSummaryEmail } from '@/lib/satmar-email';
import { recordStockMovement } from '@/lib/inventory-movements';
// deploy trigger

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', params.id);

  const { data: delivery } = await supabase
    .from('משלוחים')
    .select('*')
    .eq('הזמנה_id', params.id)
    .single();

  const { data: payments } = await supabase
    .from('תשלומים')
    .select('*')
    .eq('הזמנה_id', params.id)
    .order('תאריך_תשלום', { ascending: false });

  const { data: invoices } = await supabase
    .from('חשבוניות')
    .select('*')
    .eq('הזמנה_id', params.id)
    .order('תאריך_יצירה', { ascending: false });

  const { data: files } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('entity_type', 'order')
    .eq('entity_id', params.id)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({
    data: {
      ...order,
      מוצרים_בהזמנה: items || [],
      משלוח: delivery || null,
      תשלומים: payments || [],
      חשבוניות: invoices || [],
      קבצים: files || [],
    },
  });
}

// Call Morning Edge Function for a specific document type.
// Idempotency is enforced inside the Edge Function by (הזמנה_id + סוג_מסמך).
async function callMorning(orderId: string, documentType: 'tax_invoice' | 'receipt'): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error('[invoice] Missing env vars — SUPABASE_URL:', !!supabaseUrl, '| SERVICE_ROLE_KEY:', !!serviceRoleKey, '| WEBHOOK_SECRET:', !!webhookSecret);
    return;
  }
  try {
    console.log('[invoice] Calling Morning for', documentType, '— order:', orderId);
    const res = await fetch(`${supabaseUrl}/functions/v1/create-morning-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({
        type: 'UPDATE',
        table: 'הזמנות',
        document_type: documentType,
        record: { הזמנה_id: orderId },
        old_record: {},
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.error('[invoice] Morning failed:', res.status, JSON.stringify(body));
    else console.log('[invoice] Morning success:', JSON.stringify(body));
  } catch (err) {
    console.error('[invoice] Failed to call Morning:', err instanceof Error ? err.message : err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  console.log('[invoice] PATCH called — order:', params.id, '| body keys:', Object.keys(body).join(','), '| סטטוס_תשלום:', body.סטטוס_תשלום);
  console.log('[invoice] env — SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'MISSING', '| WEBHOOK_SECRET:', process.env.WEBHOOK_SECRET ? `set(${process.env.WEBHOOK_SECRET.length}chars)` : 'MISSING');

  // Fetch current state BEFORE update — needed for inventory check + invoice/satmar trigger
  const needPrev = body.סטטוס_הזמנה === 'בהכנה' || body.סטטוס_תשלום === 'שולם' || body.סטטוס_הזמנה === 'הושלמה בהצלחה';
  let prevOrderStatus: string | null = null;
  let prevPaymentStatus: string | null = null;
  let orderType = 'רגיל';

  if (needPrev) {
    const { data: cur } = await supabase
      .from('הזמנות')
      .select('סטטוס_הזמנה, סטטוס_תשלום, סוג_הזמנה')
      .eq('id', params.id)
      .single();
    prevOrderStatus = cur?.סטטוס_הזמנה ?? null;
    prevPaymentStatus = cur?.סטטוס_תשלום ?? null;
    orderType = (cur as Record<string, unknown> | null)?.['סוג_הזמנה'] as string ?? 'רגיל';
    console.log('[invoice] prev — סטטוס_הזמנה:', prevOrderStatus, '| סטטוס_תשלום:', prevPaymentStatus, '| סוג_הזמנה:', orderType);
  }

  const updateData: Record<string, unknown> = { ...body, תאריך_עדכון: new Date().toISOString() };

  if (body.סטטוס_הזמנה === 'הושלמה בהצלחה') {
    updateData.ארכיון = true;
  }

  const { data, error } = await supabase
    .from('הזמנות')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduct product inventory only on FIRST transition from "חדשה" → "בהכנה".
  // Same guard for both finished products and package petit-fours below.
  // Limitation: a manual revert to "חדשה" followed by another "בהכנה" will
  // re-trigger this block (the guard only checks the immediate transition).
  // Acceptable trade-off — fixing it properly needs a new boolean column or a
  // movements table; out of scope for this slice.
  if (body.סטטוס_הזמנה === 'בהכנה' && prevOrderStatus === 'חדשה') {
    // ── 1. Finished products (סוג_שורה = 'מוצר') ────────────────────────────
    const { data: items } = await supabase
      .from('מוצרים_בהזמנה')
      .select('מוצר_id, כמות')
      .eq('הזמנה_id', params.id)
      .eq('סוג_שורה', 'מוצר');

    if (items) {
      for (const item of items) {
        if (!item.מוצר_id) continue;
        const { data: product } = await supabase
          .from('מוצרים_למכירה')
          .select('שם_מוצר, כמות_במלאי')
          .eq('id', item.מוצר_id)
          .single();
        if (product) {
          const before = product.כמות_במלאי || 0;
          const after = Math.max(0, before - item.כמות);
          await supabase
            .from('מוצרים_למכירה')
            .update({ כמות_במלאי: after })
            .eq('id', item.מוצר_id);
          // Ledger: link the movement to the order so the UI can deep-link
          // back from "תנועות מלאי" to the order page.
          await recordStockMovement(supabase, {
            itemKind: 'מוצר',
            itemId: item.מוצר_id,
            itemName: product.שם_מוצר || '',
            before,
            after,
            sourceKind: 'הזמנה',
            sourceId: params.id,
            notes: 'הורדה אוטומטית במעבר ל"בהכנה"',
          });
        }
      }
    }

    // ── 2. Package petit-fours (סוג_שורה = 'מארז') ──────────────────────────
    // For each package line, fetch its בחירת_פטיפורים_בהזמנה rows and deduct
    // (selection.כמות × packageLine.כמות) from סוגי_פטיפורים.כמות_במלאי for
    // each פטיפור_id. Aggregated first so the same type used across multiple
    // packages results in one UPDATE (and one Math.max guard).
    const { data: packageLines } = await supabase
      .from('מוצרים_בהזמנה')
      .select('id, כמות')
      .eq('הזמנה_id', params.id)
      .eq('סוג_שורה', 'מארז');

    type PackageLineRow = { id: string; כמות: number | null };
    type PFSelectionRow = { שורת_הזמנה_id: string; פטיפור_id: string | null; כמות: number | null };
    const packageLineRows = (packageLines ?? []) as PackageLineRow[];
    if (packageLineRows.length > 0) {
      const packageIds = packageLineRows.map((p: PackageLineRow) => p.id);
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

        const pfIds = Object.keys(totalsByPF);
        for (const pfId of pfIds) {
          const qtyToDeduct = totalsByPF[pfId];
          const { data: pf } = await supabase
            .from('סוגי_פטיפורים')
            .select('שם_פטיפור, כמות_במלאי')
            .eq('id', pfId)
            .single();
          if (pf) {
            const before = pf.כמות_במלאי || 0;
            const after = Math.max(0, before - qtyToDeduct);
            await supabase
              .from('סוגי_פטיפורים')
              .update({ כמות_במלאי: after })
              .eq('id', pfId);
            await recordStockMovement(supabase, {
              itemKind: 'פטיפור',
              itemId: pfId,
              itemName: pf.שם_פטיפור || '',
              before,
              after,
              sourceKind: 'הזמנה',
              sourceId: params.id,
              notes: `הורדה ממארז (${qtyToDeduct} יח׳)`,
            });
          }
        }
        console.log('[order-status] deducted petit-fours from packages:',
          'lines:', packageLineRows.length,
          '| selections:', selectionRows.length,
          '| distinct types:', pfIds.length);
      }
    }
  }

  // חשבונית מס / סאטמר: first time order status → הושלמה בהצלחה
  if (body.סטטוס_הזמנה === 'הושלמה בהצלחה' && prevOrderStatus !== 'הושלמה בהצלחה') {
    if (orderType === 'סאטמר') {
      await sendSatmarSummaryEmail(params.id);
    } else {
      await callMorning(params.id, 'tax_invoice');
    }
  }

  // קבלה / סאטמר: first time payment status → שולם
  if (body.סטטוס_תשלום === 'שולם' && prevPaymentStatus !== 'שולם') {
    if (orderType === 'סאטמר') {
      await sendSatmarSummaryEmail(params.id);
    } else {
      await callMorning(params.id, 'receipt');
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('הזמנות').delete().eq('id', params.id);
  if (error) {
    const isFK = error.message.includes('foreign key') || error.message.includes('violates');
    return NextResponse.json(
      { error: isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : error.message },
      { status: isFK ? 409 : 500 },
    );
  }
  return NextResponse.json({ success: true });
}
