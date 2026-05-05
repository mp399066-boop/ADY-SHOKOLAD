import { NextResponse } from 'next/server';
import { requireAuthorizedUser } from '@/lib/auth/requireAuthorizedUser';

export async function GET() {
  const user = await requireAuthorizedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
