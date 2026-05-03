import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

async function getMorningToken(): Promise<string> {
  const apiId = process.env.MORNING_API_ID ?? '';
  const apiSecret = process.env.MORNING_API_SECRET ?? '';
  if (!apiId || !apiSecret) throw new Error('MORNING_API_ID / MORNING_API_SECRET not configured');

  const res = await fetch(`${MORNING_API_BASE}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: apiId, secret: apiSecret }),
  });
  if (!res.ok) throw new Error(`Morning auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error('No token in Morning auth response');
  return data.token;
}

// Extract Morning document ID from either URL format:
//   https://www.greeninvoice.co.il/api/v1/documents/download?d={docId}
//   https://app.greeninvoice.co.il/ext/d/{docId}
function extractDocId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const d = parsed.searchParams.get('d');
    if (d) return d;
    const m = parsed.pathname.match(/\/ext\/d\/([^/?#]+)/);
    if (m) return m[1];
  } catch { /* ignore */ }
  return null;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient();
    const { data: invoice, error } = await supabase
      .from('חשבוניות')
      .select('קישור_חשבונית, מספר_חשבונית')
      .eq('id', params.id)
      .single();

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const storedUrl: string | null = invoice.קישור_חשבונית;
    if (!storedUrl) {
      return NextResponse.json({ error: 'No URL stored for this invoice' }, { status: 404 });
    }

    const docId = extractDocId(storedUrl);
    if (!docId) {
      return NextResponse.json({ error: 'Could not extract document ID from stored URL' }, { status: 400 });
    }

    const token = await getMorningToken();

    // Use the authenticated API download endpoint regardless of what was stored
    const downloadUrl = `${MORNING_API_BASE}/documents/${docId}/download`;
    console.log('[pdf-proxy] Fetching PDF for invoice', invoice.מספר_חשבונית, '→', downloadUrl);

    const pdfRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pdfRes.ok) {
      const body = await pdfRes.text().catch(() => '');
      throw new Error(`Morning PDF download failed ${pdfRes.status}: ${body.slice(0, 200)}`);
    }

    const contentType = pdfRes.headers.get('content-type') ?? 'application/pdf';
    const pdfBuffer = await pdfRes.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': contentType.includes('pdf') ? 'application/pdf' : 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoice.מספר_חשבונית}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pdf-proxy] ERROR:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
