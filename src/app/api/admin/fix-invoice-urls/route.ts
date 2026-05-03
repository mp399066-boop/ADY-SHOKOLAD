import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// One-time fix: replace Morning download-API URLs with browser-viewable viewer URLs.
// The Morning download URL is: https://www.greeninvoice.co.il/api/v1/documents/download?d={docId}
// The viewer URL is:           https://app.greeninvoice.co.il/ext/d/{docId}
//
// Call: POST /api/admin/fix-invoice-urls
// Returns: list of invoices found, proposed viewer URL, and whether the update succeeded.

export async function POST() {
  const supabase = createAdminClient();

  const { data: invoices, error } = await supabase
    .from('חשבוניות')
    .select('id, מספר_חשבונית, קישור_חשבונית, סטטוס, תאריך_יצירה');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: object[] = [];

  for (const inv of invoices ?? []) {
    const currentUrl: string | null = inv.קישור_חשבונית;

    // Already a viewer URL or no URL — skip
    if (!currentUrl || currentUrl.includes('app.greeninvoice.co.il/ext/d/')) {
      results.push({ id: inv.id, מספר: inv.מספר_חשבונית, status: 'skipped', reason: currentUrl ? 'already viewer URL' : 'no URL', currentUrl });
      continue;
    }

    // Extract document ID from Morning download URL: ?d={docId}
    let docId: string | null = null;
    try {
      const parsed = new URL(currentUrl);
      docId = parsed.searchParams.get('d');
    } catch {
      // not a valid URL
    }

    if (!docId) {
      results.push({ id: inv.id, מספר: inv.מספר_חשבונית, status: 'skipped', reason: 'could not extract doc ID from URL', currentUrl });
      continue;
    }

    const viewerUrl = `https://app.greeninvoice.co.il/ext/d/${docId}`;

    const { error: updateErr } = await supabase
      .from('חשבוניות')
      .update({ קישור_חשבונית: viewerUrl })
      .eq('id', inv.id);

    results.push({
      id: inv.id,
      מספר: inv.מספר_חשבונית,
      status: updateErr ? 'error' : 'updated',
      docId,
      oldUrl: currentUrl,
      newUrl: viewerUrl,
      error: updateErr?.message ?? null,
    });
  }

  return NextResponse.json({ results });
}
