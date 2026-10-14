export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/order-requests/[id]  { action: 'reject' | 'reopen' }
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const [from, to] = body?.action === 'reject' ? ['חדשה', 'נדחתה'] : body?.action === 'reopen' ? ['נדחתה', 'חדשה'] : [null, null];
  if (!from) return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from('בקשות_הזמנה')
    .update({ סטטוס: to, טופל_על_ידי: auth.email ?? null, תאריך_טיפול: new Date().toISOString() })
    .eq('id', id).eq('סטטוס', from)
    .select('*').maybeSingle();
  if (error) return dbErrorResponse(error, 'order-requests PATCH');
  if (!data) return NextResponse.json({ error: 'מצב הבקשה השתנה בינתיים. יש לרענן את הדף.' }, { status: 409 });
  return NextResponse.json({ data });
}
