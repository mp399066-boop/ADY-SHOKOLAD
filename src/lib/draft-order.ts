// Server-only: creates a draft order (סטטוס_הזמנה = 'טיוטה') from a list of
// lines — used when a price quote or an order-form request is approved.
//
// A draft deducts no stock, creates no delivery/payment and sends no email.
// The owner opens it on /orders/new?draft=<id>, completes the details and
// finalizes it there; finalize-draft runs the stock guard, the delivery,
// the payment record and the customer email exactly as for any order.
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateOrderNumber } from '@/lib/utils';
import { computeQuoteTotals, lineTotal, type QuoteLine } from '@/lib/quotes';

export interface DraftOrderInput {
  customerId: string;
  lines: QuoteLine[];
  discountType?: 'ללא' | 'אחוז' | 'סכום';
  discountValue?: number;
  shipping?: number;
  deliveryDate?: string | null;
  deliveryType?: 'משלוח' | 'איסוף עצמי';
  recipientName?: string | null;
  recipientPhone?: string | null;
  address?: string | null;
  city?: string | null;
  greeting?: string | null;
  notes?: string | null;
  source: string;
}

export type DraftOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: { code?: string | null; message?: string | null }; step: string };

export async function createDraftOrder(supabase: SupabaseClient, input: DraftOrderInput): Promise<DraftOrderResult> {
  const discountType = input.discountType ?? 'ללא';
  const discountValue = input.discountValue ?? 0;
  const shipping = input.shipping ?? 0;
  const { subtotal, discount, total } = computeQuoteTotals(input.lines, discountType, discountValue, shipping);
  const isDelivery = input.deliveryType === 'משלוח';

  const { data: inserted, error } = await supabase
    .from('הזמנות')
    .insert({
      מספר_הזמנה: generateOrderNumber(),
      לקוח_id: input.customerId,
      סטטוס_הזמנה: 'טיוטה',
      הזמנה_דחופה: false,
      תאריך_הזמנה: new Date().toISOString().split('T')[0],
      תאריך_אספקה: input.deliveryDate || null,
      סוג_אספקה: isDelivery ? 'משלוח' : 'איסוף עצמי',
      שם_מקבל: isDelivery ? input.recipientName || null : null,
      טלפון_מקבל: isDelivery ? input.recipientPhone || null : null,
      כתובת_מקבל_ההזמנה: isDelivery ? input.address || null : null,
      עיר: isDelivery ? input.city || null : null,
      delivery_recipient_type: isDelivery ? (input.recipientName ? 'other' : 'customer') : null,
      דמי_משלוח: shipping,
      סוג_הזמנה: 'רגיל',
      סטטוס_תשלום: 'ממתין',
      סוג_הנחה: discountType,
      ערך_הנחה: discountValue,
      סכום_לפני_הנחה: subtotal,
      סכום_הנחה: discount,
      זיכוי_בשימוש: 0,
      סך_הכל_לתשלום: total,
      מקור_ההזמנה: input.source,
      ברכה_טקסט: input.greeting || null,
      הערות_להזמנה: input.notes || null,
    })
    .select('id, מספר_הזמנה')
    .single();
  const order = inserted as unknown as { id: string; מספר_הזמנה: string } | null;
  if (error || !order) return { ok: false, error: error ?? { message: 'no row' }, step: 'יצירת טיוטת הזמנה נכשלה' };

  const rows = input.lines.map((l, i) => {
    const base = {
      הזמנה_id: order.id,
      כמות: l.כמות,
      מחיר_ליחידה: l.מחיר_ליחידה,
      סהכ: lineTotal(l),
      הערות_לשורה: l.הערה || null,
      סדר_תצוגה: i + 1,
    };
    if (l.סוג === 'מוצר') return { ...base, סוג_שורה: 'מוצר', מוצר_id: l.מוצר_id };
    if (l.סוג === 'מארז') return { ...base, סוג_שורה: 'מארז', מוצר_id: null, גודל_מארז: l.גודל_מארז };
    return { ...base, סוג_שורה: 'מוצר_ידני', מוצר_id: null, שם_פריט_מותאם: l.שם };
  });
  if (rows.length > 0) {
    const { error: itemsError } = await supabase.from('מוצרים_בהזמנה').insert(rows);
    if (itemsError) {
      // Undo the bare draft (lines cascade) so a retry starts clean.
      await supabase.from('הזמנות').delete().eq('id', order.id);
      return { ok: false, error: itemsError, step: 'יצירת פריטי ההזמנה נכשלה' };
    }
  }
  return { ok: true, orderId: order.id, orderNumber: order.מספר_הזמנה };
}
