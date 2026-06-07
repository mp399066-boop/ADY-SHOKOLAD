export const dynamic = 'force-dynamic';

// Manual "replace raw material" — move all usages of a duplicate material onto
// a chosen existing material, WITHOUT touching stock quantities and WITHOUT
// deleting the duplicate. The user deletes the now-unused duplicate separately
// via the existing safe DELETE endpoint.
//
// References moved:
//   1. recipe ingredients (רכיבי_מתכון) — repointed; if both materials already
//      appear in the same recipe, quantities are combined only when the unit
//      matches, otherwise the whole operation is blocked for manual review.
//   2. purchase order items (פריטי_הזמנת_רכש) — repointed.
//   3. the duplicate name is added as an alias of the target material.
// Stock quantities, תנועות_מלאי history and recipes themselves are untouched.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const norm = (u: string | null | undefined) => (u ?? '').trim();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const duplicateId = params.id;
  const body = await req.json().catch(() => ({}));
  const targetId: string | undefined = body?.targetId;

  if (!targetId) return NextResponse.json({ error: 'יש לבחור חומר גלם יעד' }, { status: 400 });
  if (targetId === duplicateId)
    return NextResponse.json({ error: 'לא ניתן להחליף חומר גלם בעצמו' }, { status: 400 });

  // Both materials must exist.
  const { data: pair, error: pairErr } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('id, שם_חומר_גלם')
    .in('id', [duplicateId, targetId]);
  if (pairErr) return NextResponse.json({ error: 'בדיקת החומרים נכשלה' }, { status: 500 });
  const dup = pair?.find((m: { id: string; שם_חומר_גלם: string }) => m.id === duplicateId);
  const target = pair?.find((m: { id: string; שם_חומר_גלם: string }) => m.id === targetId);
  if (!dup || !target) return NextResponse.json({ error: 'אחד החומרים לא נמצא' }, { status: 404 });

  // Load recipe-ingredient rows for both materials.
  const [{ data: dupRows, error: dErr }, { data: tgtRows, error: tErr }] = await Promise.all([
    supabase.from('רכיבי_מתכון').select('id, מתכון_id, כמות_נדרשת, יחידת_מידה').eq('חומר_גלם_id', duplicateId),
    supabase.from('רכיבי_מתכון').select('id, מתכון_id, כמות_נדרשת, יחידת_מידה').eq('חומר_גלם_id', targetId),
  ]);
  if (dErr || tErr) return NextResponse.json({ error: 'בדיקת המתכונים נכשלה' }, { status: 500 });

  // Index target rows by recipe so we can detect overlaps (both materials in the
  // same recipe) and check unit compatibility before changing anything.
  const tgtByRecipe = new Map<string, { id: string; כמות_נדרשת: number; יחידת_מידה: string | null }>();
  for (const r of tgtRows ?? []) tgtByRecipe.set(r.מתכון_id, r);

  for (const r of dupRows ?? []) {
    const overlap = tgtByRecipe.get(r.מתכון_id);
    if (overlap && norm(overlap.יחידת_מידה) !== norm(r.יחידת_מידה)) {
      return NextResponse.json(
        {
          error: 'אותו חומר מופיע במתכון ביחידות שונות — דורש בדיקה ידנית. לא בוצעה החלפה.',
          needsManualReview: true,
        },
        { status: 409 },
      );
    }
  }

  // ── Apply (units already validated) ──
  // 1a. Recipes where both appear & units match → combine into target row, drop dup row.
  for (const r of dupRows ?? []) {
    const overlap = tgtByRecipe.get(r.מתכון_id);
    if (!overlap) continue;
    const combined = (Number(overlap.כמות_נדרשת) || 0) + (Number(r.כמות_נדרשת) || 0);
    const { error: upErr } = await supabase.from('רכיבי_מתכון').update({ כמות_נדרשת: combined }).eq('id', overlap.id);
    if (upErr) return NextResponse.json({ error: 'איחוד הכמויות במתכון נכשל. לא הושלמה ההחלפה.' }, { status: 500 });
    const { error: delErr } = await supabase.from('רכיבי_מתכון').delete().eq('id', r.id);
    if (delErr) return NextResponse.json({ error: 'עדכון המתכון נכשל. לא הושלמה ההחלפה.' }, { status: 500 });
    // Avoid combining twice if the duplicate appears more than once in one recipe.
    overlap.כמות_נדרשת = combined;
  }

  // 1b. Remaining dup rows (recipes without the target) → repoint to target.
  {
    const { error } = await supabase
      .from('רכיבי_מתכון')
      .update({ חומר_גלם_id: targetId })
      .eq('חומר_גלם_id', duplicateId);
    if (error) return NextResponse.json({ error: 'העברת המתכונים נכשלה. ייתכן שחלקם הועברו.' }, { status: 500 });
  }

  // 2. Purchase order items → repoint to target.
  {
    const { error } = await supabase
      .from('פריטי_הזמנת_רכש')
      .update({ חומר_גלם_id: targetId })
      .eq('חומר_גלם_id', duplicateId);
    if (error) return NextResponse.json({ error: 'העברת פריטי הזמנות הרכש נכשלה.' }, { status: 500 });
  }

  // 3. Add the duplicate's name as an alias of the target (idempotent).
  const aliasName = norm(dup.שם_חומר_גלם);
  if (aliasName) {
    const { error } = await supabase
      .from('raw_material_aliases')
      .insert({ raw_material_id: targetId, alias: aliasName });
    if (error && (error.code || '') !== '23505') {
      console.error('replace_raw_material: alias insert failed', { code: error.code });
    }
  }

  return NextResponse.json({
    success: true,
    movedTo: { id: target.id, name: target.שם_חומר_גלם },
    duplicate: { id: dup.id, name: dup.שם_חומר_גלם },
  });
}
