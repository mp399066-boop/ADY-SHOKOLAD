export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const active = searchParams.get('active');
  const type = searchParams.get('type');

  let query = supabase.from('מוצרים_למכירה').select('*').order('שם_מוצר');
  if (active === 'true') query = query.eq('פעיל', true);
  if (type) query = query.eq('סוג_מוצר', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// Compute the next free PRD-NNN sku. Scans both מוצרים_למכירה (catalog) and
// מחירון (price-list) so an auto-generated code never collides with an
// imported one either. Floors at 100 so the first auto-gen lands at PRD101.
async function nextProductSku(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string> {
  const [{ data: cat }, { data: prices }] = await Promise.all([
    supabase.from('מוצרים_למכירה').select('sku').like('sku', 'PRD%'),
    supabase.from('מחירון').select('sku').like('sku', 'PRD%'),
  ]);
  const nums: number[] = [];
  for (const row of [...(cat ?? []), ...(prices ?? [])]) {
    const v = (row as { sku: string | null }).sku;
    if (!v) continue;
    const n = Number(v.replace(/^PRD/i, ''));
    if (Number.isFinite(n)) nums.push(n);
  }
  const next = Math.max(100, ...nums) + 1;
  return `PRD${next}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.שם_מוצר) return NextResponse.json({ error: 'שם המוצר הוא שדה חובה' }, { status: 400 });

  // sku is optional (migration 024). Three paths:
  //   • caller supplied a non-empty string → use it (trimmed)
  //   • caller supplied null/empty/missing → auto-generate PRD101+
  //   • collision against the partial-unique index → surface a friendly error
  if (typeof body.sku === 'string' && body.sku.trim()) {
    body.sku = body.sku.trim();
  } else {
    body.sku = await nextProductSku(supabase);
  }

  const { data, error } = await supabase
    .from('מוצרים_למכירה')
    .insert(body)
    .select()
    .single();

  if (error) {
    // Postgres unique violation — the sku already exists somewhere we didn't
    // see (race or imported price-list code). Re-pitch the message in Hebrew
    // so the modal can show it.
    if (error.code === '23505' && error.message?.includes('sku')) {
      return NextResponse.json(
        { error: `קוד מוצר "${body.sku}" כבר קיים — נסי קוד אחר או השאירי ריק לקוד אוטומטי` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
