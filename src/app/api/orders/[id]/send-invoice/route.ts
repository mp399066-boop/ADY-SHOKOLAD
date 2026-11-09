export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import { sendInvoiceEmail, isInternalEmail } from '@/lib/email';
import { fetchMorningInvoicePdf } from '@/lib/morning-pdf';
import { INVOICE_DOC_LABELS, rankInvoices, prettyDocNumber } from '@/lib/invoice-docs';

// Manual "שלח חשבונית ללקוח" — emails an ALREADY-issued Morning document to the
// customer using the stored document link. This does NOT create a new invoice;
// it only resends the existing one. Recovery path for invoices that were issued
// while the customer had no email on file (so they were never delivered).

type InvoiceRow = {
  id: string;
  מספר_חשבונית: string;
  קישור_חשבונית?: string | null;
  סוג_מסמך?: string | null;
  תאריך_יצירה?: string | null;
};


export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*), חשבוניות(*)')
    .eq('id', params.id)
    .single();

  if (error || !order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const o = order as Record<string, unknown>;
  const customer = o['לקוחות'] as Record<string, string> | null;
  const invoices = (o['חשבוניות'] as InvoiceRow[] | null) ?? [];

  // The button is only meant to be available once an invoice exists, but guard
  // server-side too: pick the best existing document that actually has a link.
  const candidates = invoices.filter(i => !!(i.קישור_חשבונית && i.קישור_חשבונית.trim()));
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'לא קיים מסמך עם קישור לשליחה. יש להפיק חשבונית תחילה.' },
      { status: 400 },
    );
  }
  const invoice = rankInvoices(candidates)[0];

  const to = (customer?.['אימייל'] || '').trim();
  if (!to) {
    return NextResponse.json(
      { error: 'לא קיים מייל ללקוחה. יש לעדכן מייל בכרטיס הלקוחה ואז לשלוח שוב.' },
      { status: 400 },
    );
  }
  if (isInternalEmail(to)) {
    return NextResponse.json(
      { error: 'כתובת מייל פנימית — לא נשלח ללקוחה' },
      { status: 400 },
    );
  }

  const customerName = customer
    ? `${customer['שם_פרטי'] || ''} ${customer['שם_משפחה'] || ''}`.trim()
    : '';
  const docLabel = INVOICE_DOC_LABELS[invoice.סוג_מסמך || ''] || 'חשבונית';
  const invoiceNumber = prettyDocNumber(invoice.מספר_חשבונית);

  // Fetch the actual PDF from Morning so it can be attached. We intentionally
  // hard-fail if the PDF can't be produced — the whole point of this action is
  // to deliver the document itself, not just a link.
  let pdf: { base64: string; filename: string };
  try {
    const { buffer, filename } = await fetchMorningInvoicePdf(
      invoice.קישור_חשבונית as string,
      invoiceNumber,
    );
    pdf = { base64: buffer.toString('base64'), filename };
  } catch (err: unknown) {
    console.error('[send-invoice] PDF fetch failed:', err);
    void logActivity({
      actor:        userActor(auth),
      module:       'finance',
      action:       'invoice_email_failed',
      status:       'failed',
      entityType:   'order',
      entityId:     String(params.id),
      entityLabel:  invoiceNumber ? `#${invoiceNumber}` : ((o['מספר_הזמנה'] as string) || null),
      title:        'שליחת חשבונית ללקוחה נכשלה',
      description:  'הפקת ה-PDF של החשבונית נכשלה',
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata:     { to, invoice_id: invoice.id, invoice_number: invoiceNumber, stage: 'pdf_fetch' },
      serviceKey:   'customer_order_emails',
      request:      req,
    });
    const m = err instanceof Error ? err.message : String(err);
    const isConfig = m.includes('אינו מוגדר');
    return NextResponse.json(
      {
        error: isConfig
          ? 'שירות מורנינג אינו מוגדר בשרת (חסרים MORNING_API_ID / MORNING_API_SECRET במשתני הסביבה).'
          : 'לא ניתן להפיק כעת קובץ PDF של החשבונית. נסה שוב מאוחר יותר.',
      },
      { status: 502 },
    );
  }

  try {
    await sendInvoiceEmail(to, customerName, {
      customerId:    o['לקוח_id'] as string,
      orderId:       params.id,
      orderNumber:   (o['מספר_הזמנה'] as string) || null,
      invoiceNumber,
      invoiceUrl:    invoice.קישור_חשבונית as string,
      documentLabel: docLabel,
      pdfAttachment: pdf,
    });

    void logActivity({
      actor:       userActor(auth),
      module:      'finance',
      action:      'invoice_email_sent',
      status:      'success',
      entityType:  'order',
      entityId:    String(params.id),
      entityLabel: invoiceNumber ? `#${invoiceNumber}` : ((o['מספר_הזמנה'] as string) || null),
      title:       'נשלחה חשבונית ללקוחה',
      description: `${docLabel} (PDF מצורף) נשלחה ל-${to}`,
      metadata:    { to, invoice_id: invoice.id, invoice_number: invoiceNumber, document_type: invoice.סוג_מסמך, attached_pdf: true },
      serviceKey:  'customer_order_emails',
      request:     req,
    });

    return NextResponse.json({ message: `החשבונית (PDF) נשלחה בהצלחה ל-${to}` });
  } catch (err: unknown) {
    console.error('[send-invoice] sendInvoiceEmail failed:', err);
    void logActivity({
      actor:        userActor(auth),
      module:       'finance',
      action:       'invoice_email_failed',
      status:       'failed',
      entityType:   'order',
      entityId:     String(params.id),
      entityLabel:  invoiceNumber ? `#${invoiceNumber}` : ((o['מספר_הזמנה'] as string) || null),
      title:        'שליחת חשבונית ללקוחה נכשלה',
      description:  `נסיון שליחה ל-${to} נכשל`,
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata:     { to, invoice_id: invoice.id, invoice_number: invoiceNumber },
      serviceKey:   'customer_order_emails',
      request:      req,
    });
    return NextResponse.json(
      { error: `שגיאה בשליחת החשבונית: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}` },
      { status: 500 },
    );
  }
}
