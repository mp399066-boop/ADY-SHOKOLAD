export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import type { PreviewRow } from '../import-preview/route';

function inferProductFields(name: string): {
  סוג_מוצר: 'מוצר רגיל' | 'מארז פטיפורים';
  קטגוריית_מוצר: 'עוגה' | 'פטיפורים' | 'קינוחים' | 'מארז' | 'אחר';
} {
  const lower = name.toLowerCase();
  if (lower.includes('מארז')) return { 'סוג_מוצר': 'מארז פטיפורים', 'קטגוריית_מוצר': 'מארז' };
  if (lower.includes('עוגה') || lower.includes('עוגת')) return { 'סוג_מוצר': 'מוצר רגיל', 'קטגוריית_מוצר': 'עוגה' };
  return { 'סוג_מוצר': 'מוצר רגיל', 'קטגוריית_מוצר': 'אחר' };
}

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
  let newProductsCreated = 0;
  const createdProducts = new Map<string, string>(); // name.toLowerCase() → new product id

  for (const row of rows) {
    // Resolve product ID — create product if it doesn't exist yet
    let resolvedProductId: string | null = row.productId;
    if (!resolvedProductId && row.productName) {
      const nameKey = row.productName.toLowerCase().trim();
      if (createdProducts.has(nameKey)) {
        resolvedProductId = createdProducts.get(nameKey)!;
      } else {
        const fields = inferProductFields(row.productName);
        const { data: newProd, error: createErr } = await supabase
          .from('מוצרים_למכירה')
          .insert({
            'שם_מוצר': row.productName,
            'סוג_מוצר': fields['סוג_מוצר'],
            'קטגוריית_מוצר': fields['קטגוריית_מוצר'],
            'מחיר': row.price,
            'פעיל': true,
            'האם_צריך_בחירת_פטיפורים': false,
            'לקוחות_עסקיים_בלבד': false,
            'כמות_במארז': null,
            'כמות_במלאי': 0,
          })
          .select('id')
          .single();
        if (createErr || !newProd) continue;
        resolvedProductId = newProd.id as string;
        createdProducts.set(nameKey, resolvedProductId);
        newProductsCreated++;
      }
    }

    // Find existing price entry
    let query = supabase
      .from('מחירון')
      .select('id')
      .eq('price_type', row.priceType);

    if (resolvedProductId) {
      query = query.eq('מוצר_id', resolvedProductId);
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
      'מוצר_id': resolvedProductId ?? null,
      sku: row.sku || null,
      product_name_snapshot: row.productName,
      price_type: row.priceType,
      'מחיר': row.price,
      min_quantity: row.minQuantity ?? null,
      includes_vat: row.includesVat,
      'פעיל': row.isActive,
      uploaded_at: now,
    };

    if (existing?.id) {
      const { error } = await supabase.from('מחירון').update(payload).eq('id', existing.id);
      if (!error) updated++;
    } else {
      const { error } = await supabase.from('מחירון').insert(payload);
      if (!error) inserted++;
    }
  }

  return NextResponse.json({ inserted, updated, total: inserted + updated, newProductsCreated });
}
