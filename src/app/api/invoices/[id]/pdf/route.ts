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

// Resolve the actual download URL from whatever was stored in קישור_חשבונית.
// Stored value may be:
//   a) A JSON string: {"he":"https://...?d=TOKEN","origin":"https://...?d=TOKEN"}
//   b) A plain URL string
// Returns { downloadUrl, source }
function resolveDownloadUrl(stored: string): { downloadUrl: string; source: string } {
  const trimmed = stored.trim();

  if (trimmed.startsWith('{')) {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('storedUrl looks like JSON but failed to parse');
    }
    const url = parsed.he ?? parsed.origin ?? Object.values(parsed)[0];
    if (!url) throw new Error('JSON storedUrl has no usable URL value');
    return { downloadUrl: url, source: parsed.he ? 'he' : 'origin' };
  }

  return { downloadUrl: trimmed, source: 'plain' };
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
    console.log('[pdf-proxy] storedUrl=', storedUrl?.slice(0, 120));

    if (!storedUrl) {
      return NextResponse.json({ error: 'No URL stored for this invoice' }, { status: 404 });
    }

    const { downloadUrl, source } = resolveDownloadUrl(storedUrl);

    // Check that the download token (d=) exists — it may be any encoded string, not a UUID
    let downloadToken: string | null = null;
    try {
      downloadToken = new URL(downloadUrl).searchParams.get('d');
    } catch { /* ignore — we still try the URL as-is */ }

    console.log('[pdf-proxy] parsedUrlSource=', source);
    console.log('[pdf-proxy] downloadToken exists=', !!downloadToken);
    console.log('[pdf-proxy] downloadUrl=', downloadUrl.slice(0, 120));

    const token = await getMorningToken();

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
