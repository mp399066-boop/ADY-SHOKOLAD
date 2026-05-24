import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// Assigns / clears a courier on the existing משלוחים row for this order.
// Updates ONLY the `courier_id` column — no other delivery fields touched,
// no new rows created. If the order has no delivery row yet (e.g. an
// איסוף עצמי order) the update affects zero rows and the route returns ok
// — the UI only exposes the picker for orders that already have a משלוח.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  let body: { courier_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  // courier_id may be a UUID string or null (to unassign).
  const courierId: string | null =
    typeof body.courier_id === 'string' && body.courier_id.trim()
      ? body.courier_id.trim()
      : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('משלוחים')
    .update({ courier_id: courierId })
    .eq('הזמנה_id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
