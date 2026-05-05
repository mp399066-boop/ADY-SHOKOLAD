import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  requireManagementUser,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/requireAuthorizedUser';

const VALID_ROLES = ['admin', 'staff', 'delivery'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const body = await req.json();
  const { role, is_active } = body as { role?: string; is_active?: boolean };
  const { id } = params;

  if (role !== undefined && !VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return NextResponse.json({ error: 'תפקיד לא תקין' }, { status: 400 });
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'ערך סטטוס לא תקין' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: target } = await supabase
    .from('authorized_users')
    .select('id, email, role, is_active')
    .eq('id', id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
  }

  // Protect last active admin: block deactivation or role downgrade of the only admin
  const isRemovingAdmin =
    (target.role === 'admin' && is_active === false) ||
    (target.role === 'admin' && role !== undefined && role !== 'admin');

  if (isRemovingAdmin) {
    const { count } = await supabase
      .from('authorized_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'לא ניתן להסיר את המנהל האחרון הפעיל במערכת' },
        { status: 422 },
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from('authorized_users')
    .update(updates)
    .eq('id', id)
    .select('id, email, role, is_active, created_at')
    .single();

  if (error) {
    console.error('[users/id] PATCH error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log('[users/id] updated:', target.email, updates);
  return NextResponse.json({ data });
}
