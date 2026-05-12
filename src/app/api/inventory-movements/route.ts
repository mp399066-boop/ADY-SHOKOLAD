export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// Read-only listing of stock movements (migration 025). Filters:
//   itemKind   = חומר_גלם | מוצר | פטיפור
//   movement   = כניסה | יציאה | התאמה
//   source     = הזמנה | ידני | מערכת
//   itemId     = filter to a single item's history
//   from / to  = ISO date range on תאריך_יצירה
//   limit      = default 100, max 500
export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);

  const itemKind = searchParams.get('itemKind');
  const movement = searchParams.get('movement');
  const source = searchParams.get('source');
  const itemId = searchParams.get('itemId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(Number(searchParams.get('limit') || 100) || 100, 500);

  let query = supabase
    .from('תנועות_מלאי')
    .select('*')
    .order('תאריך_יצירה', { ascending: false })
    .limit(limit);

  if (itemKind) query = query.eq('סוג_פריט', itemKind);
  if (movement) query = query.eq('סוג_תנועה', movement);
  if (source)   query = query.eq('סוג_מקור', source);
  if (itemId)   query = query.eq('מזהה_פריט', itemId);
  if (from)     query = query.gte('תאריך_יצירה', from);
  if (to)       query = query.lte('תאריך_יצירה', to);

  const { data, error } = await query;
  if (error) {
    // Friendly hint when the table doesn't exist yet (migration 025 unrun).
    const msg = error.message?.includes('relation') && error.message?.includes('does not exist')
      ? 'טבלת תנועות_מלאי לא קיימת — הרץ את migration 025 בסופבייס SQL Editor'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
