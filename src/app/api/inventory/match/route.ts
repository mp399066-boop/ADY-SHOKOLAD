export const dynamic = 'force-dynamic';

// בדיקה אם שם חומר גלם חדש כבר קיים — מול שמות קיימים וגם מול aliases.
// קריאה-בלבד. משמש להצגת אזהרה "ייתכן שחומר הגלם הזה כבר קיים".

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { nameMatches } from '@/lib/inventory-dedup';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const name = (new URL(req.url).searchParams.get('name') ?? '').trim();
  if (!name) return NextResponse.json({ matches: [] });

  const { data: mats } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה, parent_raw_material_id')
    .limit(2000);

  const { data: aliases } = await supabase
    .from('raw_material_aliases')
    .select('raw_material_id, alias');

  // Map material id → its aliases, for matching against alias text too.
  const aliasByMaterial = new Map<string, string[]>();
  for (const a of (aliases ?? []) as { raw_material_id: string; alias: string }[]) {
    const arr = aliasByMaterial.get(a.raw_material_id) ?? [];
    arr.push(a.alias);
    aliasByMaterial.set(a.raw_material_id, arr);
  }

  type Mat = { id: string; שם_חומר_גלם: string; כמות_במלאי: number; יחידת_מידה: string; parent_raw_material_id: string | null };
  const allMats = (mats ?? []) as Mat[];
  const nameById = new Map(allMats.map(m => [m.id, m.שם_חומר_גלם]));

  const matches = allMats
    .filter(m => {
      if (nameMatches(name, m.שם_חומר_גלם)) return true;
      return (aliasByMaterial.get(m.id) ?? []).some(al => nameMatches(name, al));
    })
    .slice(0, 10)
    .map(m => ({
      id: m.id,
      name: m.שם_חומר_גלם,
      quantity: m.כמות_במלאי,
      unit: m.יחידת_מידה,
      // אם השם המתאים כבר מחובר לחומר ראשי — נציין אליו, כדי שהאזהרה תפנה לחומר הראשי
      linkedTo: m.parent_raw_material_id ? (nameById.get(m.parent_raw_material_id) ?? null) : null,
    }));

  return NextResponse.json({ matches });
}
