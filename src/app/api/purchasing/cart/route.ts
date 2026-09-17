export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const CART_SELECT = `
  id, חומר_גלם_id, שם_פריט, כמות, יחידה, ספק_id, הערה, הועבר_ידנית, תאריך_יצירה,
  מלאי_חומרי_גלם(id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה, סטטוס_מלאי, שם_מוצר_אצל_הספק, מקט_ספק, יחידת_קניה, הערות_רכש, ספק_מועדף_id),
  ספקים(id, שם_ספק, טלפון, אימייל, איש_קשר)
`;

const MAX_QTY = 1_000_000;

/** Parses a client quantity. Returns null when absent, undefined when invalid. */
function parseQty(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_QTY) return undefined;
  return Math.round(n * 1000) / 1000;
}

function cleanText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

// GET /api/purchasing/cart → every line in the cart, with its raw material and supplier
export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('סל_קניות')
    .select(CART_SELECT)
    .order('תאריך_יצירה', { ascending: true });

  if (error) {
    console.error('[purchasing/cart] GET failed', error.code);
    return NextResponse.json({ error: 'שגיאה בטעינת הסל' }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/purchasing/cart
//   { חומר_גלם_id, כמות? }   → add a raw material; name / unit / supplier are
//                               resolved SERVER-SIDE from the raw material, so the
//                               line always belongs to the assigned supplier.
//                               Adding an existing product adds to its quantity.
//   { שם_פריט, כמות?, יחידה?, ספק_id? } → free-text line
export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const qty = parseQty(body['כמות']);
  if (qty === undefined) return NextResponse.json({ error: 'כמות לא תקינה' }, { status: 400 });

  const materialId = typeof body['חומר_גלם_id'] === 'string' ? body['חומר_גלם_id'] : null;

  // ── Raw material line ───────────────────────────────────────────────────
  if (materialId) {
    const { data: material, error: matError } = await supabase
      .from('מלאי_חומרי_גלם')
      .select('id, שם_חומר_גלם, יחידת_מידה, יחידת_קניה, כמות_להזמנה, ספק_מועדף_id, הערות_רכש')
      .eq('id', materialId)
      .maybeSingle();

    if (matError) {
      console.error('[purchasing/cart] material lookup failed', matError.code);
      return NextResponse.json({ error: 'שגיאה בטעינת חומר הגלם' }, { status: 500 });
    }
    if (!material) return NextResponse.json({ error: 'חומר הגלם לא נמצא' }, { status: 404 });

    const addQty = qty ?? (Number(material.כמות_להזמנה) || 1);

    // Already in the cart → add to the existing quantity.
    const { data: existing } = await supabase
      .from('סל_קניות')
      .select('id, כמות')
      .eq('חומר_גלם_id', materialId)
      .maybeSingle();

    if (existing) {
      const merged = Math.min(MAX_QTY, Math.round((Number(existing.כמות) + addQty) * 1000) / 1000);
      const { data, error } = await supabase
        .from('סל_קניות')
        .update({ כמות: merged, תאריך_עדכון: new Date().toISOString() })
        .eq('id', existing.id)
        .select(CART_SELECT)
        .single();
      if (error) {
        console.error('[purchasing/cart] merge failed', error.code);
        return NextResponse.json({ error: 'שגיאה בעדכון הסל' }, { status: 500 });
      }
      return NextResponse.json({ data, merged: true });
    }

    const { data, error } = await supabase
      .from('סל_קניות')
      .insert({
        חומר_גלם_id: material.id,
        שם_פריט:     material.שם_חומר_גלם,
        כמות:        addQty,
        יחידה:       material.יחידת_קניה || material.יחידת_מידה || null,
        ספק_id:      material.ספק_מועדף_id ?? null,
        הערה:        material.הערות_רכש ?? null,
        נוצר_על_ידי: auth.email,
      })
      .select(CART_SELECT)
      .single();

    if (error) {
      console.error('[purchasing/cart] insert failed', error.code);
      return NextResponse.json({ error: 'שגיאה בהוספה לסל' }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  }

  // ── Free-text line ──────────────────────────────────────────────────────
  const name = cleanText(body['שם_פריט'], 200);
  if (!name) return NextResponse.json({ error: 'שם פריט הוא שדה חובה' }, { status: 400 });

  const supplierId = typeof body['ספק_id'] === 'string' ? body['ספק_id'] : null;
  if (supplierId) {
    const { data: supplier } = await supabase.from('ספקים').select('id').eq('id', supplierId).maybeSingle();
    if (!supplier) return NextResponse.json({ error: 'הספק לא נמצא' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('סל_קניות')
    .insert({
      חומר_גלם_id: null,
      שם_פריט:     name,
      כמות:        qty ?? 1,
      יחידה:       cleanText(body['יחידה'], 20),
      ספק_id:      supplierId,
      הערה:        cleanText(body['הערה'], 500),
      הועבר_ידנית: Boolean(supplierId),
      נוצר_על_ידי: auth.email,
    })
    .select(CART_SELECT)
    .single();

  if (error) {
    console.error('[purchasing/cart] free-text insert failed', error.code);
    return NextResponse.json({ error: 'שגיאה בהוספה לסל' }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

// DELETE /api/purchasing/cart?all=1 → empty the cart
export async function DELETE(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (req.nextUrl.searchParams.get('all') !== '1') {
    return NextResponse.json({ error: 'חסר פרמטר all=1' }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { error } = await supabase.from('סל_קניות').delete().not('id', 'is', null);
  if (error) {
    console.error('[purchasing/cart] clear failed', error.code);
    return NextResponse.json({ error: 'שגיאה בריקון הסל' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
