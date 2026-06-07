export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  // Read the current row first so we can log a movement when כמות_במלאי
  // changes. If the body doesn't touch כמות_במלאי this still works — the
  // before/after check below short-circuits and no movement is recorded.
  const { data: prev } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('שם_חומר_גלם, כמות_במלאי')
    .eq('id', params.id)
    .single();

  const { data, error } = await supabase
    .from('מלאי_חומרי_גלם')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (prev && data && prev.כמות_במלאי !== data.כמות_במלאי) {
    await recordStockMovement(supabase, {
      itemKind: 'חומר_גלם',
      itemId: params.id,
      itemName: data.שם_חומר_גלם || prev.שם_חומר_גלם || '',
      before: Number(prev.כמות_במלאי) || 0,
      after: Number(data.כמות_במלאי) || 0,
      sourceKind: 'ידני',
      notes: 'עדכון מלאי ידני',
      createdBy: auth.email ?? null,
    });
  }

  return NextResponse.json({ data });
}

// Manual delete of a raw material. Safe-by-default: blocks if the material is
// still referenced by recipes or purchase orders (the references that orphan
// real business documents). Only when unused do we clean up its aliases,
// duplicate suggestions and child links, then remove the row.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const id = params.id;

  // ── Safety checks — count real references before touching anything ──
  const [recipeRefs, poRefs] = await Promise.all([
    supabase.from('רכיבי_מתכון').select('id', { count: 'exact', head: true }).eq('חומר_גלם_id', id),
    supabase.from('פריטי_הזמנת_רכש').select('id', { count: 'exact', head: true }).eq('חומר_גלם_id', id),
  ]);

  if (recipeRefs.error || poRefs.error) {
    console.error('raw-material delete: usage check failed', {
      id,
      recipeErr: recipeRefs.error?.code,
      poErr: poRefs.error?.code,
    });
    return NextResponse.json({ error: 'בדיקת השימוש בחומר הגלם נכשלה. לא נמחק דבר.' }, { status: 500 });
  }

  const recipeCount = recipeRefs.count ?? 0;
  const poCount = poRefs.count ?? 0;
  if (recipeCount > 0 || poCount > 0) {
    return NextResponse.json(
      {
        error: 'אי אפשר למחוק את חומר הגלם כי הוא נמצא בשימוש במתכונים או במסמכים קיימים. קודם החליפי אותו בחומר גלם אחר.',
        blocked: true,
        usedIn: { recipeIngredients: recipeCount, purchaseOrderItems: poCount },
      },
      { status: 409 },
    );
  }

  // ── Safe to delete — clear references that would otherwise block the row ──
  // Detach any duplicate rows still pointing here as their parent so the
  // self-FK doesn't block. Quantities and recipes are never touched.
  await supabase.from('מלאי_חומרי_גלם').update({ parent_raw_material_id: null }).eq('parent_raw_material_id', id);
  // Remove alias names and duplicate suggestions connected to this material.
  await supabase.from('raw_material_aliases').delete().eq('raw_material_id', id);
  await supabase
    .from('raw_material_duplicate_suggestions')
    .delete()
    .or(`primary_raw_material_id.eq.${id},duplicate_raw_material_id.eq.${id}`);

  const { error } = await supabase.from('מלאי_חומרי_גלם').delete().eq('id', id);
  if (error) {
    // A lingering FK we didn't pre-check — surface a safe message, not raw SQL.
    console.error('raw-material delete failed', { id, code: error.code });
    return NextResponse.json(
      { error: 'אי אפשר למחוק את חומר הגלם כי קיימות רשומות מקושרות. קודם החליפי אותו בחומר גלם אחר.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true });
}
