export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import {
  sendOrderEmail,
  isInternalEmail,
  buildItemName,
  extractPetitFours,
  buildItemsSnapshot,
  type OrderEmailData,
  type OrderEmailItem,
  type OrderEmailRemovedItem,
  type OrderItemsSnapshotEntry,
  type EmailContext,
} from '@/lib/email';

// If the same exact summary (identical item ids+qty+price AND identical total)
// was already sent within this window, skip a fresh send and return a friendly
// message — protects against accidental double-clicks of "שלח סיכום מעודכן".
const DUPLICATE_SEND_GUARD_MS = 60_000;

function snapshotKey(entries: OrderItemsSnapshotEntry[]): string {
  return entries
    .map(e => `${e.id}|${e.quantity}|${e.unitPrice}`)
    .sort()
    .join(';');
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', params.id)
    .single();

  if (error || !order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', params.id)
    .order('סדר_תצוגה', { ascending: true });

  const o = order as Record<string, unknown>;
  const customer = o['לקוחות'] as Record<string, string> | null;
  const to = customer?.['אימייל'] || '';

  if (!to) {
    return NextResponse.json({ message: 'ללקוח אין כתובת אימייל — לא נשלח' });
  }
  if (isInternalEmail(to)) {
    return NextResponse.json({ message: 'כתובת מייל פנימית — לא נשלח ללקוח' });
  }

  const customerName = customer
    ? `${customer['שם_פרטי'] || ''} ${customer['שם_משפחה'] || ''}`.trim()
    : '';

  // Diff against the snapshot of items sent in the previous customer summary.
  // Snapshot is null on the first-ever send → nothing is marked "חדש" and
  // there is no "הוסרו" section. After a successful send we overwrite this
  // column with the snapshot of items the customer just received.
  const prevSnapshotRaw = o['summary_email_sent_items_snapshot'] as unknown;
  const prevSnapshot: OrderItemsSnapshotEntry[] | null = Array.isArray(prevSnapshotRaw)
    ? (prevSnapshotRaw as OrderItemsSnapshotEntry[])
    : null;
  const prevIds = new Set((prevSnapshot ?? []).map(s => s.id));
  const isFirstSummary = prevSnapshot === null;

  const currentItemsRaw = (items || []) as Record<string, unknown>[];
  const currentSnapshot = buildItemsSnapshot(currentItemsRaw);
  const currentTotal    = Number(o['סך_הכל_לתשלום'] || 0);

  // ── Soft duplicate-send guard ────────────────────────────────────────────
  // If the exact same items+total were already sent within the last 60s,
  // assume this is a double-click and skip. Operator gets a friendly message
  // explaining why no email went out. Falls back to "send" if we have no
  // snapshot of the previous send (first-ever summary).
  const lastSentAtRaw = o['summary_email_sent_at'] as string | null | undefined;
  const lastSentMs    = lastSentAtRaw ? Date.parse(lastSentAtRaw) : NaN;
  const lastSentTotal = o['summary_email_sent_total'] != null ? Number(o['summary_email_sent_total']) : null;
  if (
    Number.isFinite(lastSentMs) &&
    Date.now() - lastSentMs < DUPLICATE_SEND_GUARD_MS &&
    prevSnapshot !== null &&
    lastSentTotal !== null &&
    Math.abs(lastSentTotal - currentTotal) < 0.005 &&
    snapshotKey(prevSnapshot) === snapshotKey(currentSnapshot)
  ) {
    return NextResponse.json({
      message: 'סיכום זהה כבר נשלח ללקוח בדקה האחרונה — לא נשלח שוב',
      skipped: true,
    });
  }

  const emailItems: OrderEmailItem[] = currentItemsRaw.map((item) => {
    const prod         = item['מוצרים_למכירה']           as Record<string, unknown> | null;
    const pfSelections = item['בחירת_פטיפורים_בהזמנה']  as Record<string, unknown>[] | null;
    const petitFours   = extractPetitFours(pfSelections);

    const isPackage = item['סוג_שורה'] === 'מארז';
    const name      = buildItemName(item, prod);
    const itemId    = item['id'] as string;
    const quantity  = Number(item['כמות']        || 1);
    const unitPrice = Number(item['מחיר_ליחידה'] || 0);
    const lineTotal = Number(item['סהכ']          || 0);

    // "חדש" iff this is NOT the first summary AND the row id wasn't in the
    // previous snapshot. ID-based — robust across petit-four/manual/extra/
    // regular rows, immune to created_at drift, and unaffected by edits.
    const isNew = !isFirstSummary && !prevIds.has(itemId);

    return {
      name,
      quantity,
      unitPrice,
      lineTotal,
      ...(isPackage && petitFours.length > 0 ? { petitFours } : {}),
      ...(isNew ? { isNew: true } : {}),
    };
  });

  // Removed = anything that WAS in the previous snapshot and is NOT in the
  // current items. Shown in the email only for update mode and only when
  // non-empty. Skipped entirely on the first summary.
  const currentIds = new Set(currentSnapshot.map(s => s.id));
  const removedItems: OrderEmailRemovedItem[] = isFirstSummary
    ? []
    : (prevSnapshot ?? [])
        .filter(s => !currentIds.has(s.id))
        .map(s => ({ name: s.name, quantity: s.quantity, unitPrice: s.unitPrice }));

  const emailOrderData: OrderEmailData = {
    orderNumber:  (o['מספר_הזמנה']     as string) || '',
    orderDate:    (o['תאריך_הזמנה']     as string) || new Date().toISOString().split('T')[0],
    deliveryDate: (o['תאריך_אספקה']     as string) || null,
    subtotal:     Number(o['סכום_לפני_הנחה'] || 0),
    discount:     Number(o['סכום_הנחה']        || 0),
    total:        currentTotal,
    deliveryFee:  Number(o['דמי_משלוח']         || 0),
    customerType: (customer?.['סוג_לקוח']  as string) || null,
    orderType:    (o['סוג_הזמנה']         as string) || null,
    isUpdate:     true,
    items:        emailItems,
    ...(removedItems.length > 0 ? { removedItems } : {}),
  };

  const emailContext: EmailContext = {
    customerId: o['לקוח_id'] as string,
    orderId:    params.id,
  };

  try {
    await sendOrderEmail(to, customerName, emailOrderData, emailContext);

    // Persist what we just sent so the next "send updated summary" can diff.
    // Failure to write the snapshot column (e.g. migration not yet applied)
    // must NOT fail the user-facing send — fall back to the legacy fields.
    const baseUpdate: Record<string, unknown> = {
      summary_email_sent_at:    new Date().toISOString(),
      summary_email_sent_total: currentTotal,
    };
    const { error: snapshotErr } = await supabase
      .from('הזמנות')
      .update({ ...baseUpdate, summary_email_sent_items_snapshot: currentSnapshot })
      .eq('id', params.id);
    if (snapshotErr) {
      console.error('[send-email] snapshot write failed, retrying without snapshot column:', snapshotErr.message);
      await supabase.from('הזמנות').update(baseUpdate).eq('id', params.id);
    }

    void logActivity({
      actor:       userActor(auth),
      module:      'orders',
      action:      'order_summary_email_sent',
      status:      'success',
      entityType:  'order',
      entityId:    String(params.id),
      entityLabel: (o['מספר_הזמנה'] as string) || null,
      title:       'נשלח סיכום הזמנה ללקוח',
      description: `סיכום הזמנה נשלח ל-${to}`,
      metadata:    { to, item_count: emailItems.length, removed_count: removedItems.length, total: emailOrderData.total },
      serviceKey:  'customer_order_emails',
      request:     req,
    });

    return NextResponse.json({ message: `סיכום הזמנה נשלח בהצלחה ל-${to}` });
  } catch (err: unknown) {
    console.error('[send-email] sendOrderEmail failed:', err);
    void logActivity({
      actor:        userActor(auth),
      module:       'orders',
      action:       'order_summary_email_failed',
      status:       'failed',
      entityType:   'order',
      entityId:     String(params.id),
      entityLabel:  (o['מספר_הזמנה'] as string) || null,
      title:        'שליחת סיכום הזמנה ללקוח נכשלה',
      description:  `נסיון שליחה ל-${to} נכשל`,
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata:     { to },
      serviceKey:   'customer_order_emails',
      request:      req,
    });
    return NextResponse.json(
      { error: `שגיאה בשליחת מייל: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}` },
      { status: 500 },
    );
  }
}
