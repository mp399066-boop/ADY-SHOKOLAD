export const dynamic = 'force-dynamic';

// ============================================================================
// /api/admin/system-config — safe business defaults (ברירות מחדל).
//
// GET   → full config map (DB values merged over hardcoded defaults).
// PATCH → { key: value, ... } partial update of whitelisted keys, validated.
//
// Resilience: if system_config doesn't exist yet (migration 050 not applied),
// GET returns the hardcoded defaults with tableReady=false and writes return a
// friendly "run migration" error instead of a raw DB error.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, getActorFromRequest } from '@/lib/activity-log';
import {
  isValidConfigKey,
  configDefaultsMap,
  validateConfig,
} from '@/lib/system-config';

const UNDEFINED_TABLE = '42P01';
const MIGRATION_HINT = 'טבלת ההגדרות אינה קיימת עדיין. יש להריץ את מיגרציה 050 ב-Supabase.';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data, error } = await supabase.from('system_config').select('key, value');

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return NextResponse.json({ data: configDefaultsMap(), tableReady: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // DB values merged over defaults so any unseeded key still resolves.
  const map = configDefaultsMap();
  for (const row of (data as { key: string; value: string | null }[]) ?? []) {
    if (isValidConfigKey(row.key)) map[row.key] = row.value ?? '';
  }
  return NextResponse.json({ data: map, tableReady: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'גוף הבקשה לא תקין' }, { status: 400 });
  }

  // Keep only whitelisted keys; coerce to trimmed strings.
  const patch: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!isValidConfigKey(k)) continue;
    patch[k] = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'לא נשלחו שדות תקינים לעדכון' }, { status: 400 });
  }

  // Load current values, apply the patch, validate the resulting effective map.
  const { data: current, error: readErr } = await supabase.from('system_config').select('key, value');
  if (readErr?.code === UNDEFINED_TABLE) {
    return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
  }
  const effective = configDefaultsMap();
  for (const row of (current as { key: string; value: string | null }[]) ?? []) {
    if (isValidConfigKey(row.key)) effective[row.key] = row.value ?? '';
  }
  const before: Record<string, string> = {};
  for (const k of Object.keys(patch)) before[k] = effective[k];
  Object.assign(effective, patch);

  const errors = validateConfig(effective);
  if (errors.length) {
    return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows = Object.entries(patch).map(([key, value]) => ({ key, value, updated_at: now }));
  const { error } = await supabase.from('system_config').upsert(rows, { onConflict: 'key' });
  if (error) {
    if (error.code === UNDEFINED_TABLE) return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity({
    actor: (await getActorFromRequest()) ?? undefined,
    module: 'settings',
    action: 'system_config.update',
    entityType: 'system_config',
    entityLabel: Object.keys(patch).join(', '),
    title: 'עודכנו ברירות מחדל של המערכת',
    description: Object.keys(patch).join(', '),
    oldValue: before,
    newValue: patch,
    request: req,
  });

  // Return the full updated map for convenience.
  return NextResponse.json({ data: effective, updated: Object.keys(patch) });
}
