import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  requireManagementUser,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/requireAuthorizedUser';

const VALID_ROLES = ['admin', 'staff', 'delivery'] as const;

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('authorized_users')
    .select('id, email, role, is_active, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[users] GET error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const body = await req.json();
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const role = body.role;

  if (!email) {
    return NextResponse.json({ error: 'אימייל חובה' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'כתובת אימייל לא תקינה' }, { status: 400 });
  }
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'תפקיד לא תקין' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('authorized_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'כתובת אימייל כבר קיימת במערכת' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('authorized_users')
    .insert({ email, role, is_active: true })
    .select('id, email, role, is_active, created_at')
    .single();

  if (error) {
    console.error('[users] POST error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log('[users] added:', email, role);
  return NextResponse.json({ data }, { status: 201 });
}
