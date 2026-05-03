import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
// deploy trigger

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

  // Fetch current state BEFORE update — needed for inventory check + invoice trigger
  const needPrev = body.סטטוס_הזמנה === 'בהכנה' || body.סטטוס_תשלום === 'שולם';
  let prevOrderStatus: string | null = null;
  let prevPaymentStatus: string | null = null;

  if (needPrev) {
    const { data: cur } = await supabase
      .from('הזמנות')
      .select('סטטוס_הזמנה, סטטוס_תשלום')
      .eq('id', params.id)
      .single();
    prevOrderStatus = cur?.סטטוס_הזמנה ?? null;
    prevPaymentStatus = cur?.סטטוס_תשלום ?? null;
  }

  const updateData: Record<string, unknown> = { ...body, תאריך_עדכון: new Date().toISOString() };

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

  // Deduct product inventory only on FIRST transition from "חדשה" → "בהכנה"
  if (body.סטטוס_הזמנה === 'בהכנה' && prevOrderStatus === 'חדשה') {
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

  // Trigger invoice creation when payment status first becomes שולם
  if (body.סטטוס_תשלום === 'שולם' && prevPaymentStatus !== 'שולם') {
    // Idempotency: skip if invoice already exists
    const { data: existingInvoice } = await supabase
      .from('חשבוניות')
      .select('id')
      .eq('הזמנה_id', params.id)
      .maybeSingle();

    if (existingInvoice) {
      console.log('[invoice] Invoice already exists for order', params.id, '— skipping');
    } else {
      const supabaseUrl = process.env.SUPABASE_URL ?? '';
      const webhookSecret = process.env.WEBHOOK_SECRET ?? '';

      if (!supabaseUrl || !webhookSecret) {
        console.error('[invoice] Missing SUPABASE_URL or WEBHOOK_SECRET — cannot trigger invoice creation');
      } else {
        const fnUrl = `${supabaseUrl}/functions/v1/create-morning-invoice`;
        const webhookPayload = {
          type: 'UPDATE',
          table: 'הזמנות',
          record: { הזמנה_id: params.id, סטטוס_תשלום: 'שולם' },
          old_record: { סטטוס_תשלום: prevPaymentStatus },
        };

        try {
          console.log('[invoice] Calling create-morning-invoice for order', params.id);
          const fnRes = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${webhookSecret}`,
            },
            body: JSON.stringify(webhookPayload),
          });

          const fnBody = await fnRes.json().catch(() => ({}));
          if (!fnRes.ok) {
            console.error('[invoice] create-morning-invoice failed:', fnRes.status, JSON.stringify(fnBody));
          } else {
            console.log('[invoice] create-morning-invoice success:', JSON.stringify(fnBody));
          }
        } catch (err) {
          console.error('[invoice] Failed to call create-morning-invoice:', err instanceof Error ? err.message : err);
        }
      }
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const { error } = await supabase.from('הזמנות').delete().eq('id', params.id);
  if (error) {
    const isFK = error.message.includes('foreign key') || error.message.includes('violates');
    return NextResponse.json(
      { error: isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : error.message },
      { status: isFK ? 409 : 500 },
    );
  }
  return NextResponse.json({ success: true });
}
