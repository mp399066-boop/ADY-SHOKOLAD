export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { hourlyRateSchema } from '@/lib/product-costs-schema';

// PUT /api/costs/settings { labor_hourly_rate: number | null } → saves the
// hourly labor rate (₪/hour) used to turn production time into labor cost.

export async function PUT(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const parsed = hourlyRateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'עלות שעת עבודה לא תקינה' }, { status: 400 });

  const rate = parsed.data.labor_hourly_rate;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('system_config')
    .upsert({ key: 'labor_hourly_rate', value: rate == null ? '' : String(rate), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('[costs settings PUT]', { code: error.code });
    return NextResponse.json({ error: 'שמירת עלות שעת העבודה נכשלה' }, { status: 500 });
  }
  console.log('[costs settings PUT] labor_hourly_rate updated', { by: auth.email });
  return NextResponse.json({ hourlyRate: rate });
}
