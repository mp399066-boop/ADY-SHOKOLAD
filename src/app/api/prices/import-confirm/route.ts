export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import type { PreviewRow } from '../import-preview/route';

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const body = await req.json() as { rows: PreviewRow[] };
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'אין שורות לייבוא' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    // Find existing entry
    let query = supabase
      .from('מחירון')
      .select('id')
      .eq('price_type', row.priceType);

    if (row.productId) {
      query = query.eq('מוצר_id', row.productId);
    } else {
      query = query.eq('product_name_snapshot', row.productName).is('מוצר_id', null);
    }

    if (row.minQuantity !== null && row.minQuantity !== undefined) {
      query = query.eq('min_quantity', row.minQuantity);
    } else {
      query = query.is('min_quantity', null);
    }

    const { data: existing } = await query.maybeSingle();

    const payload = {
      מוצר_id: row.productId ?? null,
      sku: row.sku || null,
      product_name_snapshot: row.productName,
      price_type: row.priceType,
      מחיר: row.price,
      min_quantity: row.minQuantity ?? null,
      includes_vat: row.includesVat,
      פעיל: row.isActive,
      uploaded_at: now,
      סוג_לקוח: row.priceType,
    };

    if (existing?.id) {
      const { error } = await supabase.from('מחירון').update(payload).eq('id', existing.id);
      if (!error) updated++;
    } else {
      const { error } = await supabase.from('מחירון').insert(payload);
      if (!error) inserted++;
    }
  }

  return NextResponse.json({ inserted, updated, total: inserted + updated });
}
