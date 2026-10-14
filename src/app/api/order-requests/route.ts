export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, requireAdminUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isMissingTable } from '@/lib/finance-expense-schema';
import { SALES_MIGRATION_HINT } from '@/lib/quotes-server';
import { currentFormToken, ORDER_FORM_TOKEN_KEY } from '@/lib/order-form-server';
import { newPublicToken } from '@/lib/public-token';

// GET  /api/order-requests → requests from the public form, newest first,
//                             plus the form link state { formToken }.
// POST /api/order-requests  { action: 'open' | 'regenerate' | 'close' }
//      → opens the form (new link), replaces the link (old one stops
//        working) or closes it. Admin only.

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const [{ data, error }, formToken] = await Promise.all([
    fetchAllPages((a, b) => supabase
      .from('בקשות_הזמנה')
      .select('*')
      .order('תאריך_יצירה', { ascending: false })
      .order('id')
      .range(a, b)),
    currentFormToken(supabase),
  ]);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ data: [], tableReady: false, hint: SALES_MIGRATION_HINT, formToken: null });
    return dbErrorResponse(error, 'order-requests GET');
  }
  return NextResponse.json({ data, tableReady: true, formToken });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== 'open' && action !== 'regenerate' && action !== 'close') {
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (action === 'open') {
    const existing = await currentFormToken(supabase);
    if (existing) return NextResponse.json({ formToken: existing });
  }
  const value = action === 'close' ? '' : newPublicToken();
  const { error } = await supabase.from('system_config')
    .upsert({ key: ORDER_FORM_TOKEN_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return dbErrorResponse(error, 'order-requests link');
  console.log('[order-requests] form link', { action });
  return NextResponse.json({ formToken: value || null });
}
