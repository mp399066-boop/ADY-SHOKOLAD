export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

type LowStockMaterial = {
  id: string;
  שם_חומר_גלם: string;
  כמות_במלאי: number;
  יחידת_מידה: string | null;
  יחידת_קניה: string | null;
  כמות_מינימום: number;
  כמות_להזמנה: number | null;
  ספק_מועדף_id: string | null;
  הערות_רכש: string | null;
};

// POST /api/purchasing/cart/low-stock
// Convenience: drop every raw material that is at or below its minimum into
// the cart in one go. Products already in the cart are left untouched.
export async function POST() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: materials, error } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה, יחידת_קניה, כמות_מינימום, כמות_להזמנה, ספק_מועדף_id, הערות_רכש')
    .gt('כמות_מינימום', 0);

  if (error) {
    console.error('[purchasing/cart/low-stock] load failed', error.code);
    return NextResponse.json({ error: 'שגיאה בטעינת חומרי הגלם' }, { status: 500 });
  }

  const low = ((materials ?? []) as LowStockMaterial[])
    .filter(m => Number(m.כמות_במלאי) <= Number(m.כמות_מינימום));
  if (low.length === 0) return NextResponse.json({ added: 0 });

  const { data: existing, error: existingError } = await supabase
    .from('סל_קניות')
    .select('חומר_גלם_id')
    .not('חומר_גלם_id', 'is', null);

  if (existingError) {
    console.error('[purchasing/cart/low-stock] cart load failed', existingError.code);
    return NextResponse.json({ error: 'שגיאה בטעינת הסל' }, { status: 500 });
  }

  const inCart = new Set(((existing ?? []) as Array<{ חומר_גלם_id: string | null }>).map(r => r.חומר_גלם_id));
  const rows = low
    .filter(m => !inCart.has(m.id))
    .map(m => {
      const deficit = Number(m.כמות_מינימום) - Number(m.כמות_במלאי);
      const qty = Number(m.כמות_להזמנה) || (deficit > 0 ? deficit : Number(m.כמות_מינימום)) || 1;
      return {
        חומר_גלם_id: m.id,
        שם_פריט:     m.שם_חומר_גלם,
        כמות:        Math.round(qty * 1000) / 1000,
        יחידה:       m.יחידת_קניה || m.יחידת_מידה || null,
        ספק_id:      m.ספק_מועדף_id ?? null,
        הערה:        m.הערות_רכש ?? null,
        נוצר_על_ידי: auth.email,
      };
    });

  if (rows.length === 0) return NextResponse.json({ added: 0 });

  const { error: insertError } = await supabase.from('סל_קניות').insert(rows);
  if (insertError) {
    console.error('[purchasing/cart/low-stock] insert failed', insertError.code);
    return NextResponse.json({ error: 'שגיאה בהוספה לסל' }, { status: 500 });
  }

  return NextResponse.json({ added: rows.length });
}
