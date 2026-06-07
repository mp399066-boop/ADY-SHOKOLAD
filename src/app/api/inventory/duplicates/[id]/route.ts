export const dynamic = 'force-dynamic';

// אישור / דחייה של הצעת כפילות.
//   action='approve' → יוצר alias מהשם של החומר הכפול אל החומר הראשי,
//                      ומסמן את ההצעה approved. לא מוחק, לא ממזג כמויות.
//   action='reject'  → מסמן rejected בלבד.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action חייב להיות approve או reject' }, { status: 400 });
  }

  const { data: suggestion, error: sErr } = await supabase
    .from('raw_material_duplicate_suggestions')
    .select('id, primary_raw_material_id, duplicate_raw_material_id, status')
    .eq('id', params.id)
    .single();
  if (sErr || !suggestion) return NextResponse.json({ error: 'הצעה לא נמצאה' }, { status: 404 });

  if (action === 'reject') {
    const { error } = await supabase
      .from('raw_material_duplicate_suggestions')
      .update({ status: 'rejected' })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: 'rejected' });
  }

  // approve — safest path: link the duplicate's name as an alias of the
  // primary material. Quantities, recipes and the duplicate row are untouched.
  const { data: dup } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('שם_חומר_גלם')
    .eq('id', suggestion.duplicate_raw_material_id)
    .single();

  const aliasName = (dup?.שם_חומר_גלם ?? '').trim();
  if (aliasName) {
    // Ignore unique-violation (alias already linked) — idempotent.
    const { error: aErr } = await supabase
      .from('raw_material_aliases')
      .insert({ raw_material_id: suggestion.primary_raw_material_id, alias: aliasName });
    if (aErr && (aErr.code || '') !== '23505') {
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }
  }

  // Real parent link: the duplicate row now points to the main material so the
  // inventory groups them. Row, quantity and recipes are untouched.
  if (suggestion.duplicate_raw_material_id !== suggestion.primary_raw_material_id) {
    const { error: lErr } = await supabase
      .from('מלאי_חומרי_גלם')
      .update({ parent_raw_material_id: suggestion.primary_raw_material_id })
      .eq('id', suggestion.duplicate_raw_material_id);
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  const { error: uErr } = await supabase
    .from('raw_material_duplicate_suggestions')
    .update({ status: 'approved' })
    .eq('id', params.id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true, status: 'approved', alias: aliasName });
}
