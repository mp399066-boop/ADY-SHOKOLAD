export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// GET /api/purchasing           → items where כמות_במלאי <= כמות_מינימום (needed to order)
// GET /api/purchasing?all=1     → ALL raw materials with purchasing fields (for settings tab)
export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const all = req.nextUrl.searchParams.get('all') === '1';

  let query = supabase
    .from('מלאי_חומרי_גלם')
    .select('*, ספקים(id, שם_ספק, טלפון, אימייל)')
    .order('שם_חומר_גלם');

  if (!all) {
    query = query.gt('כמות_מינימום', 0);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let result = data ?? [];
  if (!all) {
    result = result.filter(
      (item: { כמות_במלאי: number; כמות_מינימום: number }) =>
        Number(item.כמות_במלאי) <= Number(item.כמות_מינימום),
    );
  }

  return NextResponse.json({ data: result });
}
