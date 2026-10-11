export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('מתכונים').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// Full recipe edit from the recipe card's "עריכה" button: name, yield,
// notes and the ingredient lines (change material / quantity / unit, add,
// remove). The production-target link is NOT touched here — it has its own
// PATCH flow below. Ingredient lines are diffed by id so unchanged rows keep
// their ids; nothing else references רכיבי_מתכון.id.
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  type IngIn = { id?: unknown; חומר_גלם_id?: unknown; כמות_נדרשת?: unknown; יחידת_מידה?: unknown };
  let body: { שם_מתכון?: unknown; כמות_תוצר?: unknown; הערות?: unknown; רכיבים?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  const name = typeof body.שם_מתכון === 'string' ? body.שם_מתכון.trim() : '';
  if (!name) return NextResponse.json({ error: 'שם המתכון הוא שדה חובה' }, { status: 400 });
  const yieldQty = Number(body.כמות_תוצר);
  if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
    return NextResponse.json({ error: 'כמות תוצר חייבת להיות מספר חיובי' }, { status: 400 });
  }
  const notes = typeof body.הערות === 'string' ? body.הערות.trim() : '';
  if (!Array.isArray(body.רכיבים)) return NextResponse.json({ error: 'רשימת רכיבים חסרה' }, { status: 400 });

  // Rows without a chosen material are dropped (same as create); every
  // remaining row must have a positive quantity and a unit.
  const lines: { id: string | null; חומר_גלם_id: string; כמות_נדרשת: number; יחידת_מידה: string }[] = [];
  for (const raw of body.רכיבים as IngIn[]) {
    const matId = typeof raw?.חומר_גלם_id === 'string' ? raw.חומר_גלם_id.trim() : '';
    if (!matId) continue;
    const qty = Number(raw.כמות_נדרשת);
    const unit = typeof raw.יחידת_מידה === 'string' ? raw.יחידת_מידה.trim() : '';
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'כל רכיב חייב כמות גדולה מאפס' }, { status: 400 });
    }
    if (!unit) return NextResponse.json({ error: 'כל רכיב חייב יחידת מידה' }, { status: 400 });
    lines.push({ id: typeof raw.id === 'string' && raw.id ? raw.id : null, חומר_גלם_id: matId, כמות_נדרשת: qty, יחידת_מידה: unit });
  }

  const { data: recipe, error: rErr } = await supabase.from('מתכונים').select('id').eq('id', params.id).maybeSingle();
  if (rErr) return NextResponse.json({ error: 'טעינת המתכון נכשלה' }, { status: 500 });
  if (!recipe) return NextResponse.json({ error: 'המתכון לא נמצא' }, { status: 404 });

  // Every referenced material must exist.
  const matIds = Array.from(new Set(lines.map(l => l.חומר_גלם_id)));
  if (matIds.length) {
    const { data: mats, error: mErr } = await supabase.from('מלאי_חומרי_גלם').select('id').in('id', matIds);
    if (mErr) return NextResponse.json({ error: 'בדיקת חומרי הגלם נכשלה' }, { status: 500 });
    if ((mats ?? []).length !== matIds.length) {
      return NextResponse.json({ error: 'אחד מחומרי הגלם לא נמצא במלאי' }, { status: 400 });
    }
  }

  // Existing lines of THIS recipe — a client-sent id that isn't one of them
  // is treated as a new line, never as a write to another recipe's row.
  const { data: existing, error: eErr } = await supabase.from('רכיבי_מתכון').select('id').eq('מתכון_id', params.id);
  if (eErr) return NextResponse.json({ error: 'טעינת רכיבי המתכון נכשלה' }, { status: 500 });
  const existingIds = new Set<string>((existing ?? []).map((r: { id: string }) => r.id));

  const { error: upErr } = await supabase
    .from('מתכונים')
    .update({ שם_מתכון: name, כמות_תוצר: yieldQty, הערות: notes || null })
    .eq('id', params.id);
  if (upErr) {
    console.error('[recipes/put] recipe update failed', { recipe: params.id, code: upErr.code });
    return NextResponse.json({ error: 'שמירת המתכון נכשלה' }, { status: 500 });
  }

  const keptIds = new Set<string>();
  const toInsert: { מתכון_id: string; חומר_גלם_id: string; כמות_נדרשת: number; יחידת_מידה: string }[] = [];
  for (const l of lines) {
    if (l.id && existingIds.has(l.id) && !keptIds.has(l.id)) {
      keptIds.add(l.id);
      const { error } = await supabase
        .from('רכיבי_מתכון')
        .update({ חומר_גלם_id: l.חומר_גלם_id, כמות_נדרשת: l.כמות_נדרשת, יחידת_מידה: l.יחידת_מידה })
        .eq('id', l.id);
      if (error) {
        console.error('[recipes/put] ingredient update failed', { recipe: params.id, code: error.code });
        return NextResponse.json({ error: 'עדכון רכיבי המתכון נכשל' }, { status: 500 });
      }
    } else {
      toInsert.push({ מתכון_id: params.id, חומר_גלם_id: l.חומר_גלם_id, כמות_נדרשת: l.כמות_נדרשת, יחידת_מידה: l.יחידת_מידה });
    }
  }
  if (toInsert.length) {
    const { error } = await supabase.from('רכיבי_מתכון').insert(toInsert);
    if (error) {
      console.error('[recipes/put] ingredient insert failed', { recipe: params.id, code: error.code });
      return NextResponse.json({ error: 'הוספת רכיבים למתכון נכשלה' }, { status: 500 });
    }
  }
  const toDelete = Array.from(existingIds).filter(id => !keptIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from('רכיבי_מתכון').delete().in('id', toDelete);
    if (error) {
      console.error('[recipes/put] ingredient delete failed', { recipe: params.id, code: error.code });
      return NextResponse.json({ error: 'הסרת רכיבים מהמתכון נכשלה' }, { status: 500 });
    }
  }

  console.log('[recipes/put] recipe:', params.id, '| lines:', lines.length,
    '| added:', toInsert.length, '| removed:', toDelete.length, '| by:', auth.email);
  return NextResponse.json({ success: true });
}

// Manual recipe → production-target link / unlink. Used by the recipe
// card's "שייכי למלאי" picker. UNLIKE /api/recipes/auto-link-apply (which
// refuses overwrites by design) this route ALLOWS the operator to change
// an existing link — they may have linked the wrong target originally.
//
// Body shapes accepted:
//   { production_target_type: 'sale_product'|'petit_four', production_target_id: <uuid> }
//   { production_target_type: null, production_target_id: null }   ← unlink
//   { מוצר_id: <uuid>|null }  ← LEGACY back-compat (sale_product only)
//
// Server-side validates the target row exists AND is active before writing.
// For 'sale_product' targets we also keep מוצר_id in sync so existing UI
// joins that still rely on the legacy column keep rendering. For
// 'petit_four' targets מוצר_id is forced to null.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  type Body = {
    מוצר_id?: string | null;
    production_target_type?: 'sale_product' | 'petit_four' | null;
    production_target_id?: string | null;
  };
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  // Normalize the body into a single (type, id) decision.
  let targetType: 'sale_product' | 'petit_four' | null;
  let targetId:   string | null;

  if (body.production_target_type !== undefined || body.production_target_id !== undefined) {
    // New shape.
    targetType = body.production_target_type ?? null;
    const rawId = typeof body.production_target_id === 'string' ? body.production_target_id.trim() : null;
    targetId   = rawId || null;
    if ((targetType === null) !== (targetId === null)) {
      return NextResponse.json({ error: 'יש לציין גם סוג יעד וגם מזהה יעד, או לאפס את שניהם' }, { status: 400 });
    }
    if (targetType !== null && targetType !== 'sale_product' && targetType !== 'petit_four') {
      return NextResponse.json({ error: 'סוג יעד ייצור לא תקין' }, { status: 400 });
    }
  } else if (body.מוצר_id !== undefined) {
    // Legacy shape — sale_product only.
    const rawId = typeof body.מוצר_id === 'string' ? body.מוצר_id.trim() : null;
    targetId   = rawId || (body.מוצר_id === null ? null : null);
    targetType = targetId ? 'sale_product' : null;
  } else {
    return NextResponse.json({ error: 'גוף הבקשה חסר' }, { status: 400 });
  }

  // Re-validate the target row exists + is active before linking.
  if (targetType === 'sale_product' && targetId) {
    const { data: product, error: e } = await supabase
      .from('מוצרים_למכירה')
      .select('id, פעיל')
      .eq('id', targetId)
      .single();
    if (e || !product) return NextResponse.json({ error: 'המוצר לא נמצא במלאי' }, { status: 400 });
    if (!product.פעיל) return NextResponse.json({ error: 'לא ניתן לשייך מתכון למוצר לא פעיל' }, { status: 400 });
  } else if (targetType === 'petit_four' && targetId) {
    const { data: pf, error: e } = await supabase
      .from('סוגי_פטיפורים')
      .select('id, פעיל')
      .eq('id', targetId)
      .single();
    if (e || !pf) return NextResponse.json({ error: 'סוג הפטיפור לא נמצא במלאי' }, { status: 400 });
    if (!pf.פעיל) return NextResponse.json({ error: 'לא ניתן לשייך מתכון לסוג פטיפור לא פעיל' }, { status: 400 });
  }

  // Build the update. Keep legacy מוצר_id in sync ONLY for sale_product
  // targets — petit_four targets force it null so old joins don't render
  // a stale product link.
  const update: Record<string, string | null> = {
    production_target_type: targetType ?? 'sale_product', // CHECK constraint can't be null
    production_target_id:   targetId,
    מוצר_id:                targetType === 'sale_product' ? targetId : null,
  };

  const { data, error } = await supabase
    .from('מתכונים')
    .update(update)
    .eq('id', params.id)
    .select('id, מוצר_id, production_target_type, production_target_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log('[recipes/patch] recipe:', params.id,
    '| targetType:', targetType ?? 'null',
    '| targetId:', targetId ?? 'null',
    '| by:', auth.email);
  return NextResponse.json({ data });
}
