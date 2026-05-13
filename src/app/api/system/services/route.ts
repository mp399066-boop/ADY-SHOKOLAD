export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenAdminResponse, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { SERVICE_KEYS, SERVICE_FALLBACK_LABELS, type ServiceKey } from '@/lib/system-services';

// GET /api/system/services
//
// Returns every registered service with its current toggle + last run.
// Admin-only. Used by /settings/system-control to render the cards.
//
// We merge DB rows with the static SERVICE_KEYS list so a service that
// was added in code but hasn't been seeded yet still surfaces (with
// is_enabled=true defaulted, matching the helper's fail-open behavior).
export async function GET() {
  const user = await requireAdminUser();
  if (!user) {
    // Distinguish "not logged in" vs "logged in but not admin" so the UI
    // can route the operator correctly.
    const { requireAuthorizedUser } = await import('@/lib/auth/requireAuthorizedUser');
    const anyUser = await requireAuthorizedUser();
    return anyUser ? forbiddenAdminResponse() : unauthorizedResponse();
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('system_services')
    .select('id, service_key, display_name, description, category, is_enabled, last_run_at, last_status, updated_at')
    .order('category', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    service_key: string;
    display_name: string;
    description: string | null;
    category: string | null;
    is_enabled: boolean;
    last_run_at: string | null;
    last_status: string | null;
    updated_at: string | null;
  };
  const dbRows = ((data || []) as Row[]).reduce<Map<string, Row>>((acc, row) => {
    acc.set(row.service_key, row);
    return acc;
  }, new Map());

  // Merge: every code-registered key appears, even if not yet seeded.
  const services = SERVICE_KEYS.map<Row>(key => {
    const row = dbRows.get(key);
    if (row) return row;
    const fb = SERVICE_FALLBACK_LABELS[key as ServiceKey];
    return {
      id: '',
      service_key:   key,
      display_name:  fb.display,
      description:   fb.description,
      category:      fb.category,
      is_enabled:    true,
      last_run_at:   null,
      last_status:   null,
      updated_at:    null,
    };
  });

  return NextResponse.json({ services });
}
