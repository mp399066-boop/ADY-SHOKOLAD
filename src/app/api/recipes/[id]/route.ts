export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { error } = await supabase.from('מתכונים').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
