export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { syncCatalogFromPriceRows } from '@/lib/price-sync';

// Only the price and the active flag are editable here; anything else in the
// body (product link, tier, ids) is rejected rather than written through.
const pricePatchSchema = z.object({
  מחיר: z.number({ invalid_type_error: 'מחיר לא תקין' }).finite('מחיר לא תקין').min(0, 'מחיר לא יכול להיות שלילי').max(1_000_000, 'מחיר לא תקין'),
  פעיל: z.boolean(),
}).partial().strict();

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const parsed = pricePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: parsed.success ? 'אין מה לעדכן' : parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('מחירון')
    .update({ ...parsed.data, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return dbErrorResponse(error, 'prices/[id]');
  await syncCatalogFromPriceRows(supabase, [params.id]);
  return NextResponse.json({ data });
}
