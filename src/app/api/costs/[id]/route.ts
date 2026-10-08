export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { costRowInputSchema, COST_COLUMNS, normalizeCostRow } from '@/lib/product-costs-schema';
import { validateCostLinks, isDuplicateName, DUPLICATE_NAME_ERROR } from '@/lib/product-costs-server';

// PATCH  /api/costs/:id → replace the editable fields of one cost row
// DELETE /api/costs/:id → remove it

const idSchema = z.string().uuid();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = costRowInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const supabase = createAdminClient();
  const linkError = await validateCostLinks(supabase, parsed.data);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

  const { data, error } = await supabase
    .from('עלויות_מוצרים')
    .update({ ...parsed.data, עודכן_על_ידי: auth.email ?? null, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select(COST_COLUMNS)
    .maybeSingle();
  if (error) {
    if (isDuplicateName(error)) return NextResponse.json({ error: DUPLICATE_NAME_ERROR }, { status: 400 });
    console.error('[costs PATCH]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'שמירת העלות נכשלה' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'השורה לא נמצאה' }, { status: 404 });
  return NextResponse.json({ data: normalizeCostRow(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('עלויות_מוצרים').delete().eq('id', params.id);
  if (error) {
    console.error('[costs DELETE]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
