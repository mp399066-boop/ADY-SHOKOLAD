export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { rawPriceSchema } from '@/lib/product-costs-schema';

// PATCH /api/costs/raw-materials/:id { מחיר_ליחידה } → updates ONLY the price
// of a raw material (per its own יחידת_מידה). Stock quantities are untouched.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = rawPriceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'מחיר לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('מלאי_חומרי_גלם')
    .update({ מחיר_ליחידה: parsed.data.מחיר_ליחידה, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, מחיר_ליחידה, תאריך_עדכון')
    .maybeSingle();
  if (error) {
    console.error('[costs raw-material PATCH]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'עדכון המחיר נכשל' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'חומר הגלם לא נמצא' }, { status: 404 });
  return NextResponse.json({ data: { ...data, מחיר_ליחידה: data.מחיר_ליחידה == null ? null : Number(data.מחיר_ליחידה) } });
}
