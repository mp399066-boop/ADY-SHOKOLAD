export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('חשבוניות')
    .select('*, הזמנות(מספר_הזמנה), לקוחות(שם_פרטי, שם_משפחה)')
    .order('תאריך_יצירה', { ascending: false });
  if (error) return dbErrorResponse(error, 'invoices');
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  // Always stamp the author server-side so the client doesn't need to know the email.
  const row = { ...body, נוצר_על_ידי: body.נוצר_על_ידי ?? auth.email ?? null };
  const { data, error } = await supabase.from('חשבוניות').insert(row).select().single();
  if (error) return dbErrorResponse(error, 'invoices');
  return NextResponse.json({ data }, { status: 201 });
}
