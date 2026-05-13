import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export interface AuthorizedUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Validates the incoming request has an authenticated, authorized session.
 * Uses the cookie-based SSR client (anon key) to get the user, then checks
 * the authorized_users table. Returns null if: no session, email not in
 * authorized_users, or is_active = false.
 */
export async function requireAuthorizedUser(): Promise<AuthorizedUser | null> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const { data } = await supabase
      .from('authorized_users')
      .select('email, role, is_active')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    if (!data?.is_active) return null;

    return { id: user.id, email: data.email, role: data.role };
  } catch {
    return null;
  }
}

/**
 * Like requireAuthorizedUser but restricts to management roles (admin, staff).
 * The 'delivery' role is excluded from management API operations.
 */
export async function requireManagementUser(): Promise<AuthorizedUser | null> {
  const user = await requireAuthorizedUser();
  if (!user) return null;
  if (!['admin', 'staff'].includes(user.role)) return null;
  return user;
}

/**
 * Strict admin gate. Used by the system-control routes (`/api/system/...`)
 * — toggling automation switches must never be available to staff/delivery
 * roles, even if they're authenticated.
 */
export async function requireAdminUser(): Promise<AuthorizedUser | null> {
  const user = await requireAuthorizedUser();
  if (!user) return null;
  if (user.role !== 'admin') return null;
  return user;
}

export function forbiddenAdminResponse(): NextResponse {
  return NextResponse.json({ error: 'גישה למרכז הבקרה מוגבלת לאדמין בלבד.' }, { status: 403 });
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
