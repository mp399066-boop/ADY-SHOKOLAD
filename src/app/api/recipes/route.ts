export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('מתכונים')
    .select('*, מוצרים_למכירה(שם_מוצר), רכיבי_מתכון(*, מלאי_חומרי_גלם(שם_חומר_גלם, יחידת_מידה))')
    .order('שם_מתכון');
  if (error) return dbErrorResponse(error, 'recipes');
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();
  const { רכיבים, ...recipeData } = body;

  if (!recipeData.שם_מתכון) return NextResponse.json({ error: 'שם המתכון הוא שדה חובה' }, { status: 400 });

  if (!recipeData.מוצר_id) recipeData.מוצר_id = null;

  const { data: recipe, error: recipeError } = await supabase
    .from('מתכונים')
    .insert(recipeData)
    .select()
    .single();

  if (recipeError) return dbErrorResponse(recipeError, 'recipes');

  const validIngredients = (רכיבים || []).filter(
    (r: { חומר_גלם_id: string }) => r.חומר_גלם_id && r.חומר_גלם_id !== '',
  );
  if (validIngredients.length) {
    const ingredients = validIngredients.map((r: { חומר_גלם_id: string; כמות_נדרשת: number; יחידת_מידה: string }) => ({
      מתכון_id: recipe!.id,
      חומר_גלם_id: r.חומר_גלם_id,
      כמות_נדרשת: r.כמות_נדרשת,
      יחידת_מידה: r.יחידת_מידה,
    }));
    const { error: ingError } = await supabase.from('רכיבי_מתכון').insert(ingredients);
    if (ingError) return dbErrorResponse(ingError, 'recipes');
  }

  return NextResponse.json({ data: recipe }, { status: 201 });
}
