export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { recordStockMovement } from '@/lib/inventory-movements';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ייצור')
    .select('*, מוצרים_למכירה(שם_מוצר)')
    .order('תאריך_ייצור', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.מוצר_id) return NextResponse.json({ error: 'מוצר הוא שדה חובה' }, { status: 400 });
  if (!body.כמות_שיוצרה) return NextResponse.json({ error: 'כמות היא שדה חובה' }, { status: 400 });

  // Get recipes for this product
  const { data: recipes } = await supabase
    .from('מתכונים')
    .select('*, רכיבי_מתכון(*)')
    .eq('מוצר_id', body.מוצר_id);

  // Create production record
  const { data: production, error: prodError } = await supabase
    .from('ייצור')
    .insert({
      מוצר_id: body.מוצר_id,
      כמות_שיוצרה: body.כמות_שיוצרה,
      תאריך_ייצור: body.תאריך_ייצור || new Date().toISOString().split('T')[0],
      הערות: body.הערות || null,
    })
    .select()
    .single();

  if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 });

  // Deduct raw materials based on recipes
  if (recipes && recipes.length > 0) {
    for (const recipe of recipes) {
      const multiplier = body.כמות_שיוצרה / (recipe.כמות_תוצר || 1);
      for (const ingredient of (recipe.רכיבי_מתכון || [])) {
        const deduction = ingredient.כמות_נדרשת * multiplier;
        const { data: material } = await supabase
          .from('מלאי_חומרי_גלם')
          .select('שם_חומר_גלם, כמות_במלאי')
          .eq('id', ingredient.חומר_גלם_id)
          .single();

        if (material) {
          const before = Number(material.כמות_במלאי) || 0;
          const after = Math.max(0, before - deduction);
          await supabase
            .from('מלאי_חומרי_גלם')
            .update({ כמות_במלאי: after })
            .eq('id', ingredient.חומר_גלם_id);
          await recordStockMovement(supabase, {
            itemKind: 'חומר_גלם',
            itemId: ingredient.חומר_גלם_id,
            itemName: material.שם_חומר_גלם || '',
            before,
            after,
            sourceKind: 'מערכת',
            sourceId: production?.id ?? null,
            notes: `הורדת חומר גלם בייצור (מתכון: ${recipe.שם_מתכון || '—'})`,
            createdBy: auth.email,
          });
        }
      }
    }
  }

  return NextResponse.json({ data: production }, { status: 201 });
}
