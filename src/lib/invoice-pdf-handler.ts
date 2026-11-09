import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { fetchMorningInvoicePdf } from '@/lib/morning-pdf';
import { rankInvoices, prettyDocNumber } from '@/lib/invoice-docs';

// Shared core for downloading the PDF of an already-issued Morning document for
// an order. Picks the best existing document that has a stored link (same
// selection as the "send invoice" action) and streams its PDF back as an
// attachment. Does NOT create or modify any document.
//
// Used by both /api/orders/[id]/invoice-pdf and the `.pdf`-looking sibling
// /api/orders/[id]/invoice.pdf — same bytes/headers, different URL (the `.pdf`
// suffix lets a content-filtering proxy recognise it as a downloadable file).

type InvoiceRow = {
  id: string;
  מספר_חשבונית: string;
  קישור_חשבונית?: string | null;
  סוג_מסמך?: string | null;
  תאריך_יצירה?: string | null;
};


export async function buildInvoicePdfResponse(orderId: string): Promise<NextResponse> {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, חשבוניות(*)')
    .eq('id', orderId)
    .single();

  if (error || !order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const invoices = ((order as Record<string, unknown>)['חשבוניות'] as InvoiceRow[] | null) ?? [];
  const candidates = invoices.filter(i => !!(i.קישור_חשבונית && i.קישור_חשבונית.trim()));
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'לא קיימת חשבונית עם קישור להורדה.' }, { status: 400 });
  }
  const invoice = rankInvoices(candidates)[0];
  const invoiceNumber = prettyDocNumber(invoice.מספר_חשבונית);

  try {
    const { buffer, filename } = await fetchMorningInvoicePdf(
      invoice.קישור_חשבונית as string,
      invoiceNumber,
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: unknown) {
    console.error('[invoice-pdf] PDF fetch failed:', err);
    const m = err instanceof Error ? err.message : String(err);
    const isConfig = m.includes('אינו מוגדר');
    const diag = (err as { diag?: unknown })?.diag;
    return NextResponse.json(
      {
        error: isConfig
          ? 'שירות מורנינג אינו מוגדר בשרת (חסרים MORNING_API_ID / MORNING_API_SECRET במשתני הסביבה).'
          : 'לא ניתן להפיק כעת קובץ PDF של החשבונית. נסה שוב מאוחר יותר.',
        ...(diag ? { diag } : {}),
      },
      { status: 502 },
    );
  }
}
