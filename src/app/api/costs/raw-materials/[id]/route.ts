export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { rawPriceSchema } from '@/lib/product-costs-schema';
import { missingColumnMessage } from '@/lib/db-error';

// PATCH /api/costs/raw-materials/:id { מחיר_ליחידה?, מחיר_כולל_מעמ? } → updates
// ONLY the price of a raw material (per its own יחידת_מידה) and whether that
// price includes VAT. Stock quantities are untouched.

const VAT_MIGRATION_HINT = 'כדי לסמן מחיר כולל מע״מ יש להריץ את מיגרציה 067 (supabase/migrations/067_raw_material_price_vat.sql) ב-Supabase SQL Editor.';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = rawPriceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'מחיר לא תקין' }, { status: 400 });

  const update: Record<string, unknown> = { תאריך_עדכון: new Date().toISOString() };
  if (parsed.data.מחיר_ליחידה !== undefined) update.מחיר_ליחידה = parsed.data.מחיר_ליחידה;
  if (parsed.data.מחיר_כולל_מעמ !== undefined) update.מחיר_כולל_מעמ = parsed.data.מחיר_כולל_מעמ;
  const withVat = parsed.data.מחיר_כולל_מעמ !== undefined;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('מלאי_חומרי_גלם')
    .update(update)
    .eq('id', params.id)
    .select(withVat ? 'id, מחיר_ליחידה, מחיר_כולל_מעמ, תאריך_עדכון' : 'id, מחיר_ליחידה, תאריך_עדכון')
    .maybeSingle();
  if (error) {
    console.error('[costs raw-material PATCH]', { id: params.id, code: error.code });
    if (withVat && missingColumnMessage(error)) return NextResponse.json({ error: VAT_MIGRATION_HINT }, { status: 409 });
    return NextResponse.json({ error: 'עדכון המחיר נכשל' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'חומר הגלם לא נמצא' }, { status: 404 });
  const row = data as unknown as { id: string; מחיר_ליחידה: unknown; מחיר_כולל_מעמ?: boolean; תאריך_עדכון: string | null };
  return NextResponse.json({ data: { ...row, מחיר_ליחידה: row.מחיר_ליחידה == null ? null : Number(row.מחיר_ליחידה) } });
}
