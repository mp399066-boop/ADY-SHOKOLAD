import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

// Try every known Green Invoice URL format in order of specificity:
//   1. ?d=DOCID                                  (download query param)
//   2. /ext/d/DOCID                               (viewer path)
//   3. /documents/DOCID/download                  (REST path)
//   4. /documents/download?id=DOCID               (alternate query param)
//   5. any UUID anywhere in the URL               (last resort)
function extractDocId(url: string): string | null {
  try {
    const parsed = new URL(url);

    const d = parsed.searchParams.get('d') ?? parsed.searchParams.get('id');
    if (d && UUID_RE.test(d)) return d;

    // non-UUID ?d= still worth trying (Morning sometimes uses short IDs)
    if (d) return d;

    const patterns = [
      /\/ext\/d\/([^/?#]+)/,
      /\/documents\/([^/?#]+)\/download/,
      /\/documents\/([^/?#]+)/,
    ];
    for (const re of patterns) {
      const m = parsed.pathname.match(re);
      if (m?.[1]) return m[1];
    }

    // last resort: first UUID anywhere in the full URL
    const anyUuid = url.match(UUID_RE);
    if (anyUuid) return anyUuid[0];
  } catch { /* malformed URL */ }
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
    console.log('[pdf-proxy] storedUrl=', storedUrl);

    if (!storedUrl) {
      return NextResponse.json({ error: 'No URL stored for this invoice' }, { status: 404 });
    }

    const docId = extractDocId(storedUrl);
    console.log('[pdf-proxy] extractedDocId=', docId);

    if (!docId) {
      return NextResponse.json({
        error: 'Could not extract document ID from stored URL',
        storedUrl,
      }, { status: 400 });
    }

    const token = await getMorningToken();

    const downloadUrl = `${MORNING_API_BASE}/documents/${docId}/download`;
    console.log('[pdf-proxy] downloadUrl=', downloadUrl);

    const pdfRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pdfRes.ok) {
      const body = await pdfRes.text().catch(() => '');
      throw new Error(`Morning PDF download failed ${pdfRes.status}: ${body.slice(0, 300)}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
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
