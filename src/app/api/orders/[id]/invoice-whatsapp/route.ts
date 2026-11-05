export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { invoiceWhatsappLink } from '@/lib/whatsapp';
import { invoiceShareUrl } from '@/lib/invoice-share-link';

// "שלח בוואטסאפ" — returns a wa.me link with a ready message to the customer.
// The message carries our signed PDF link (no Morning login for the customer).

type OrderRow = {
  מספר_הזמנה: string | null;
  לקוחות: { שם_פרטי: string | null; טלפון: string | null } | null;
  חשבוניות: { id: string; מספר_חשבונית: string | null; קישור_חשבונית: string | null; סוג_מסמך: string | null; תאריך_יצירה: string | null }[] | null;
};

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('הזמנות')
    .select('מספר_הזמנה, לקוחות(שם_פרטי, טלפון), חשבוניות(id, מספר_חשבונית, קישור_חשבונית, סוג_מסמך, תאריך_יצירה)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });
  const order = data as unknown as OrderRow;

  try {
    const res = invoiceWhatsappLink(
      order.חשבוניות ?? [],
      order.לקוחות?.טלפון,
      order.לקוחות?.שם_פרטי ?? '',
      order.מספר_הזמנה,
      inv => invoiceShareUrl(inv.id as string),
    );
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ url: res.url });
  } catch (err: unknown) {
    console.error('[invoice-whatsapp] link build failed', { orderId: id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'לא ניתן ליצור קישור לחשבונית כרגע.' }, { status: 500 });
  }
}
