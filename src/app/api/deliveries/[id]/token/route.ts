import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: existing, error: fetchError } = await supabase
    .from('משלוחים')
    .select('id, delivery_token')
    .eq('id', params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'משלוח לא נמצא' }, { status: 404 });
  }

  const token = existing.delivery_token || randomBytes(32).toString('hex');

  if (!existing.delivery_token) {
    const { error: updateError } = await supabase
      .from('משלוחים')
      .update({ delivery_token: token })
      .eq('id', params.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '';
  const link = `${origin}/delivery-update/${token}`;

  return NextResponse.json({ token, link });
}
