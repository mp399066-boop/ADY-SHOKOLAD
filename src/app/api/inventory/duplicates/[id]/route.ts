export const dynamic = 'force-dynamic';

// אישור / דחייה / מיזוג של הצעת כפילות.
//   action='approve' → יוצר alias + קישור הורה. לא מוחק, לא ממזג כמויות.
//   action='reject'  → מסמן rejected בלבד.
//   action='merge'   → מיזוג אטומי (RPC): מעביר הפניות + כמויות בטוחות אל הראשי
//                      ומוחק את הכפול. נכשל בבטחה אם יחידות לא תואמות.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// מיפוי שגיאות RPC להודעות בטוחות למשתמש.
const MERGE_ERRORS: Record<string, string> = {
  MERGE_UNIT_MISMATCH:        'יחידות המלאי אינן תואמות — דורש בדיקה ידנית. לא בוצע מיזוג.',
  MERGE_RECIPE_UNIT_MISMATCH: 'אותו חומר מופיע במתכון ביחידות שונות — דורש בדיקה ידנית. לא בוצע מיזוג.',
  MERGE_NOT_FOUND:            'אחד החומרים לא נמצא.',
  MERGE_SAME:                 'לא ניתן למזג חומר עם עצמו.',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject' && action !== 'merge') {
    return NextResponse.json({ error: 'action חייב להיות approve / reject / merge' }, { status: 400 });
  }

  const { data: suggestion, error: sErr } = await supabase
    .from('raw_material_duplicate_suggestions')
    .select('id, primary_raw_material_id, duplicate_raw_material_id, status')
    .eq('id', params.id)
    .single();
  if (sErr || !suggestion) return NextResponse.json({ error: 'הצעה לא נמצאה' }, { status: 404 });

  if (action === 'merge') {
    const { data, error } = await supabase.rpc('merge_raw_material', {
      p_main: suggestion.primary_raw_material_id,
      p_duplicate: suggestion.duplicate_raw_material_id,
    });
    if (error) {
      const key = Object.keys(MERGE_ERRORS).find(k => (error.message || '').includes(k));
      if (key) return NextResponse.json({ error: MERGE_ERRORS[key], needsManualReview: key.includes('UNIT') }, { status: 409 });
      console.error('merge_raw_material failed', { suggestion: params.id, code: error.code });
      return NextResponse.json({ error: 'המיזוג נכשל. לא שונה דבר.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, status: 'merged', ...(data as object) });
  }

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
