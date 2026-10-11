export const dynamic = 'force-dynamic';

// מחיקת שם חלופי בודד. לא נוגע בחומר הגלם עצמו.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('raw_material_aliases').delete().eq('id', params.id);
  if (error) return dbErrorResponse(error, 'inventory/aliases/[id]');
  return NextResponse.json({ success: true });
}
