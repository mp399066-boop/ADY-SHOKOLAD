// Server-only helper: fetch the PDF bytes of an already-issued Morning
// (Green Invoice) document so it can be attached to an email.
//
// The CRM stores a *viewer* URL on the invoice row (קישור_חשבונית), e.g.
//   https://app.greeninvoice.co.il/ext/d/{docId}
// which is NOT a direct PDF. To get the actual PDF we:
//   1. extract the Morning document id from the stored URL,
//   2. authenticate against the Morning API,
//   3. GET /documents/{id} to obtain a fresh signed download URL (url.origin),
//   4. fetch that URL (Bearer) to receive the PDF bytes.
//
// Secrets (MORNING_API_ID / MORNING_API_SECRET) are read from env on the
// server only and never logged.

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

async function getMorningToken(): Promise<string> {
  const apiId = process.env.MORNING_API_ID ?? '';
  const apiSecret = process.env.MORNING_API_SECRET ?? '';
  if (!apiId || !apiSecret) throw new Error('שירות מורנינג אינו מוגדר (MORNING_API_ID / MORNING_API_SECRET)');

  const res = await fetch(`${MORNING_API_BASE}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: apiId, secret: apiSecret }),
  });
  if (!res.ok) throw new Error(`Morning auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error('No token in Morning auth response');
  return data.token as string;
}

// Pull the Morning document id out of whatever URL form is stored:
//   - viewer URL .../ext/d/{docId}
//   - download URL ...?d={docId}
//   - API URL .../documents/{docId}
export function extractMorningDocId(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  // Stored value may be a JSON blob {he, origin} (legacy) — unwrap first.
  let urlStr = trimmed;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      urlStr = parsed.he ?? parsed.origin ?? Object.values(parsed)[0] ?? '';
    } catch { /* fall through and try as a plain URL */ }
  }

  try {
    const u = new URL(urlStr);
    const d = u.searchParams.get('d');
    if (d) return d;
    const segs = u.pathname.split('/').filter(Boolean);
    const dIdx = segs.lastIndexOf('d');
    if (dIdx >= 0 && segs[dIdx + 1]) return segs[dIdx + 1];
    const docIdx = segs.lastIndexOf('documents');
    if (docIdx >= 0 && segs[docIdx + 1]) return segs[docIdx + 1];
    return segs[segs.length - 1] || null;
  } catch {
    return null;
  }
}

// Only ever fetch PDFs from the Morning/GreenInvoice domain over HTTPS — guards
// against a tampered stored URL causing the Bearer token to leak to an
// arbitrary host (SSRF).
function assertMorningHost(downloadUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new Error('Invalid Morning download URL');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('greeninvoice.co.il')) {
    throw new Error(`Refusing non-Morning host: ${parsed.hostname}`);
  }
  return parsed;
}

export interface MorningPdf {
  buffer: Buffer;
  filename: string;
}

// Fetches the PDF bytes for an already-issued document. `storedUrl` is the
// value of חשבוניות.קישור_חשבונית. `invoiceNumber` is used only for the
// suggested filename. Throws (Hebrew/English) on any failure — the caller
// decides how to surface it.
export async function fetchMorningInvoicePdf(
  storedUrl: string,
  invoiceNumber?: string | null,
): Promise<MorningPdf> {
  const docId = extractMorningDocId(storedUrl);
  if (!docId) throw new Error('לא ניתן לחלץ מזהה מסמך מהקישור');

  const token = await getMorningToken();

  // Ask Morning for the document → fresh signed download URL (url.origin).
  const docRes = await fetch(`${MORNING_API_BASE}/documents/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!docRes.ok) {
    const body = await docRes.text().catch(() => '');
    throw new Error(`Morning document lookup failed ${docRes.status}: ${body.slice(0, 200)}`);
  }
  const doc = await docRes.json();
  const downloadUrl: string | undefined = doc?.url?.origin ?? doc?.url?.he;
  // Safe diagnostic (no secrets/signed URLs/query params) — pinpoints why the
  // download URL is missing/rejected before the PDF fetch. Attached to any
  // error thrown below so the route can surface it in the JSON response.
  const chosenField = doc?.url?.origin ? 'url.origin' : doc?.url?.he ? 'url.he' : 'none';
  let host = 'none';
  if (downloadUrl) { try { host = new URL(downloadUrl).hostname; } catch { host = 'unparseable'; } }
  const diag = {
    status: docRes.status,
    docKeys: Object.keys(doc ?? {}),
    urlKeys: Object.keys(doc?.url ?? {}),
    chosenField,
    host,
  };
  console.error('[invoice-pdf] doc lookup', JSON.stringify(diag));

  if (!downloadUrl) {
    const e = new Error('תגובת מורנינג אינה כוללת קישור הורדה למסמך') as Error & { diag?: unknown };
    e.diag = diag;
    throw e;
  }

  let parsed: URL;
  try {
    parsed = assertMorningHost(downloadUrl);
  } catch (err) {
    const e = (err instanceof Error ? err : new Error(String(err))) as Error & { diag?: unknown };
    e.diag = diag;
    throw e;
  }

  const pdfRes = await fetch(parsed.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pdfRes.ok) {
    const body = await pdfRes.text().catch(() => '');
    throw new Error(`Morning PDF download failed ${pdfRes.status}: ${body.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await pdfRes.arrayBuffer());
  const safeNumber = (invoiceNumber ?? docId).toString().replace(/[^\w.-]+/g, '_');
  return { buffer, filename: `invoice-${safeNumber}.pdf` };
}
