export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import {
  sendOrderEmail,
  isInternalEmail,
  type OrderEmailData,
  type OrderEmailItem,
  type OrderEmailRemovedItem,
  type EmailContext,
} from '@/lib/email';

// Shape of one entry in summary_email_sent_items_snapshot (jsonb).
// Stored after every successful customer summary send so the NEXT send
// can diff and surface "חדש" / "הוסרו בעדכון האחרון" cleanly.
interface ItemsSnapshotEntry {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

// Build a stable display name for any supported row type (regular product,
// package, manual item, extra charge). Used for both the email and the
// snapshot so removed items show the same label the customer saw before.
function buildItemName(item: Record<string, unknown>, prod: Record<string, unknown> | null): string {
  const rowType  = item['סוג_שורה'] as string;
  const isPackage = rowType === 'מארז';
  const isCustom  = rowType === 'מוצר_ידני' || rowType === 'תוספת_תשלום';
  if (isPackage) return `מארז ${item['גודל_מארז'] || ''} פטיפורים`.trim();
  if (isCustom)  return (item['שם_פריט_מותאם'] as string) || 'פריט';
  return (prod?.['שם_מוצר'] as string) || 'פריט';
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
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
  const prevSnapshot: ItemsSnapshotEntry[] | null = Array.isArray(prevSnapshotRaw)
    ? (prevSnapshotRaw as ItemsSnapshotEntry[])
    : null;
  const prevIds = new Set((prevSnapshot ?? []).map(s => s.id));
  const isFirstSummary = prevSnapshot === null;

  const currentItemsRaw = items || [];
  const currentSnapshot: ItemsSnapshotEntry[] = [];

  const emailItems: OrderEmailItem[] = currentItemsRaw.map((item: Record<string, unknown>) => {
    const prod         = item['מוצרים_למכירה']           as Record<string, unknown> | null;
    const pfSelections = item['בחירת_פטיפורים_בהזמנה']  as Record<string, unknown>[] | null;
    const petitFours   = (pfSelections ?? [])
      .map(s => {
        const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
        return pf?.['שם_פטיפור']
          ? { name: pf['שם_פטיפור'], quantity: Number(s['כמות'] ?? 0) }
          : null;
      })
      .filter((p): p is { name: string; quantity: number } => p !== null && p.quantity > 0);

    const rowType   = item['סוג_שורה'] as string;
    const isPackage = rowType === 'מארז';
    const name      = buildItemName(item, prod);
    const itemId    = item['id'] as string;
    const quantity  = Number(item['כמות']        || 1);
    const unitPrice = Number(item['מחיר_ליחידה'] || 0);
    const lineTotal = Number(item['סהכ']          || 0);

    // "חדש" iff this is NOT the first summary AND the row id wasn't in the
    // previous snapshot. ID-based — robust across petit-four/manual/extra/
    // regular rows, immune to created_at drift, and unaffected by edits.
    const isNew = !isFirstSummary && !prevIds.has(itemId);

    currentSnapshot.push({ id: itemId, name, quantity, unitPrice });

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
    total:        Number(o['סך_הכל_לתשלום']    || 0),
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
      summary_email_sent_total: o['סך_הכל_לתשלום'] ?? 0,
    };
    const { error: snapshotErr } = await supabase
      .from('הזמנות')
      .update({ ...baseUpdate, summary_email_sent_items_snapshot: currentSnapshot })
      .eq('id', params.id);
    if (snapshotErr) {
      console.error('[send-email] snapshot write failed, retrying without snapshot column:', snapshotErr.message);
      await supabase.from('הזמנות').update(baseUpdate).eq('id', params.id);
    }

    return NextResponse.json({ message: `סיכום הזמנה נשלח בהצלחה ל-${to}` });
  } catch (err: unknown) {
    console.error('[send-email] sendOrderEmail failed:', err);
    return NextResponse.json(
      { error: `שגיאה בשליחת מייל: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}` },
      { status: 500 },
    );
  }
}
