export const dynamic = 'force-dynamic';

// PUBLIC route — no login. Serves the PDF of ONE issued invoice to the
// customer from the signed link sent on WhatsApp (see invoice-share-link.ts).
// Read-only: never creates or changes a document.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyInvoiceToken } from '@/lib/invoice-share-link';
import { fetchMorningInvoicePdf } from '@/lib/morning-pdf';

function textResponse(body: string, status: number) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invoiceId = verifyInvoiceToken(token);
  if (!invoiceId) return textResponse('הקישור לא תקין', 404);

  const supabase = createAdminClient();
  const { data: invoice } = await supabase
    .from('חשבוניות')
    .select('id, מספר_חשבונית, קישור_חשבונית')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice?.קישור_חשבונית) return textResponse('הקישור לא תקין', 404);

  const num = String(invoice.מספר_חשבונית ?? '').replace(/^manual:/, '').trim() || null;
  try {
    const { buffer, filename } = await fetchMorningInvoicePdf(invoice.קישור_חשבונית, num);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err: unknown) {
    console.error('[public-invoice] PDF fetch failed', { invoiceId, error: err instanceof Error ? err.message : String(err) });
    return textResponse('לא ניתן להציג כעת את החשבונית. נסו שוב מאוחר יותר.', 502);
  }
}
