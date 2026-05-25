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

// Manual recipe → sale-product link / unlink. Used by the recipe card's
// "שייכי למוצר" picker. UNLIKE /api/recipes/auto-link-apply (which refuses
// overwrites by design) this route ALLOWS the operator to change an
// existing link — they may have linked the wrong product originally.
// Validates the target product is active before writing.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  let body: { מוצר_id?: string | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  // Accept either a UUID string (link / re-link) or null (unlink).
  const productId =
    typeof body.מוצר_id === 'string' && body.מוצר_id.trim()
      ? body.מוצר_id.trim()
      : (body.מוצר_id === null ? null : undefined);
  if (productId === undefined) {
    return NextResponse.json({ error: 'מזהה מוצר חסר או לא תקין' }, { status: 400 });
  }

  if (productId !== null) {
    // Re-validate the product exists + is active before linking.
    const { data: product, error: prodErr } = await supabase
      .from('מוצרים_למכירה')
      .select('id, פעיל')
      .eq('id', productId)
      .single();
    if (prodErr || !product) {
      return NextResponse.json({ error: 'המוצר לא נמצא במלאי' }, { status: 400 });
    }
    if (!product.פעיל) {
      return NextResponse.json({ error: 'לא ניתן לשייך מתכון למוצר לא פעיל' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('מתכונים')
    .update({ מוצר_id: productId })
    .eq('id', params.id)
    .select('id, מוצר_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log('[recipes/patch] recipe:', params.id, '| newProductId:', productId ?? 'null', '| by:', auth.email);
  return NextResponse.json({ data });
}
