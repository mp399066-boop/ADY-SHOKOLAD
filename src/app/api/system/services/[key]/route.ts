export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenAdminResponse, unauthorizedResponse, requireAuthorizedUser } from '@/lib/auth/requireAuthorizedUser';
import { SERVICE_KEYS, type ServiceKey } from '@/lib/system-services';

// PATCH /api/system/services/[key]
//
// Toggles is_enabled for a single service. Admin-only.
//
// Body: { is_enabled: boolean }
//
// We INSERT-or-UPDATE so a service that was added in code but never seeded
// still gets a row when the admin first toggles it (the migration's seed
// is the standard path; this is the safety net).

const bodySchema = z.object({
  is_enabled: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { key: string } },
) {
  const user = await requireAdminUser();
  if (!user) {
    const anyUser = await requireAuthorizedUser();
    return anyUser ? forbiddenAdminResponse() : unauthorizedResponse();
  }

  const key = params.key;
  if (!(SERVICE_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: `שירות לא ידוע: ${key}` }, { status: 400 });
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || 'נתונים לא תקינים' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Upsert by service_key. The seed defines display_name + description; if
  // the row doesn't exist yet we still write the toggle and the migration's
  // next ON CONFLICT will fill in the cosmetic fields.
  const { data, error } = await supabase
    .from('system_services')
    .upsert(
      {
        service_key: key as ServiceKey,
        is_enabled:  parsed.data.is_enabled,
        updated_at:  new Date().toISOString(),
        updated_by:  user.id,
      },
      { onConflict: 'service_key' },
    )
    .select('service_key, is_enabled, updated_at')
    .single();

  if (error) {
    console.error('[system/services PATCH] failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    `[system/services] toggle ${key} → ${parsed.data.is_enabled ? 'ENABLED' : 'DISABLED'} by ${user.email}`,
  );

  return NextResponse.json({ ok: true, service: data });
}
