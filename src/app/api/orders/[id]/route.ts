import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', params.id);

  const { data: delivery } = await supabase
    .from('משלוחים')
    .select('*')
    .eq('הזמנה_id', params.id)
    .single();

  const { data: payments } = await supabase
    .from('תשלומים')
    .select('*')
    .eq('הזמנה_id', params.id)
    .order('תאריך_תשלום', { ascending: false });

  const { data: invoices } = await supabase
    .from('חשבוניות')
    .select('*')
    .eq('הזמנה_id', params.id)
    .order('תאריך_יצירה', { ascending: false });

  const { data: files } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('entity_type', 'order')
    .eq('entity_id', params.id)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({
    data: {
      ...order,
      מוצרים_בהזמנה: items || [],
      משלוח: delivery || null,
      תשלומים: payments || [],
      חשבוניות: invoices || [],
      קבצים: files || [],
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const body = await req.json();

  const updateData: Record<string, unknown> = { ...body, תאריך_עדכון: new Date().toISOString() };

  // Auto-archive on completion
  if (body.סטטוס_הזמנה === 'הושלמה בהצלחה') {
    updateData.ארכיון = true;
  }

  const { data, error } = await supabase
    .from('הזמנות')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduct product inventory when moving to "בהכנה"
  if (body.סטטוס_הזמנה === 'בהכנה') {
    const { data: items } = await supabase
      .from('מוצרים_בהזמנה')
      .select('מוצר_id, כמות')
      .eq('הזמנה_id', params.id)
      .eq('סוג_שורה', 'מוצר');

    if (items) {
      for (const item of items) {
        if (!item.מוצר_id) continue;
        const { data: product } = await supabase
          .from('מוצרים_למכירה')
          .select('כמות_במלאי')
          .eq('id', item.מוצר_id)
          .single();
        if (product) {
          await supabase
            .from('מוצרים_למכירה')
            .update({ כמות_במלאי: Math.max(0, (product.כמות_במלאי || 0) - item.כמות) })
            .eq('id', item.מוצר_id);
        }
      }
    }
  }

  return NextResponse.json({ data });
}
