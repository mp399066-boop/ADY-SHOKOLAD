export const dynamic = 'force-dynamic';

// שמות חלופיים לחומר גלם. GET ?material_id=… מחזיר את כל ה-aliases של חומר,
// POST מוסיף alias חדש. לא נוגע בשורת המלאי עצמה.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const materialId = new URL(req.url).searchParams.get('material_id');
  if (!materialId) return NextResponse.json({ error: 'material_id חסר' }, { status: 400 });

  const { data, error } = await supabase
    .from('raw_material_aliases')
    .select('id, raw_material_id, alias, created_at')
    .eq('raw_material_id', materialId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  const rawMaterialId = typeof body.raw_material_id === 'string' ? body.raw_material_id : '';
  const alias = typeof body.alias === 'string' ? body.alias.trim() : '';
  if (!rawMaterialId) return NextResponse.json({ error: 'raw_material_id חסר' }, { status: 400 });
  if (!alias) return NextResponse.json({ error: 'שם חלופי ריק' }, { status: 400 });
  if (alias.length > 200) return NextResponse.json({ error: 'שם חלופי ארוך מדי' }, { status: 400 });

  const { data, error } = await supabase
    .from('raw_material_aliases')
    .insert({ raw_material_id: rawMaterialId, alias })
    .select('id, raw_material_id, alias, created_at')
    .single();

  // Unique-violation → alias already exists for this material; treat as ok-ish.
  if (error) {
    if ((error.code || '') === '23505') {
      return NextResponse.json({ error: 'שם חלופי זה כבר קיים' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
