export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { loadSalesCatalog } from '@/lib/quotes-server';

// GET /api/quotes/catalog → active products, packages and price list for the
// quote editor (default prices are filled in by customer type, then editable).
export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const { data, error } = await loadSalesCatalog(createAdminClient());
  if (error || !data) return dbErrorResponse(error, 'quotes/catalog');
  return NextResponse.json(data);
}
