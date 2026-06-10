export const dynamic = 'force-dynamic';

// ============================================================================
// /api/admin/option-lists — managed content lists (רשימות ניהול).
//
// GET  ?list_key=...   → rows for one list (or all lists if omitted).
// POST { list_key, value, label? } → add a value.
//
// Resilience: if the system_option_lists table doesn't exist yet (migration
// 049 not applied), GET returns the hardcoded defaults with tableReady=false
// so the forms keep working, and writes return a friendly "run migration"
// error instead of a raw DB error.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, getActorFromRequest } from '@/lib/activity-log';
import {
  OPTION_LIST_KEYS,
  isValidListKey,
  getListDef,
  defaultRowsFor,
  type OptionListRow,
} from '@/lib/option-lists';

const UNDEFINED_TABLE = '42P01';
const MIGRATION_HINT = 'טבלת הרשימות אינה קיימת עדיין. יש להריץ את מיגרציה 049 ב-Supabase.';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const listKey = searchParams.get('list_key');
  if (listKey && !isValidListKey(listKey)) {
    return NextResponse.json({ error: 'list_key לא חוקי' }, { status: 400 });
  }

  let query = supabase
    .from('system_option_lists')
    .select('id, list_key, value, label, sort_order, is_active, is_system')
    .order('list_key', { ascending: true })
    .order('sort_order', { ascending: true });
  if (listKey) query = query.eq('list_key', listKey);

  const { data, error } = await query;

  if (error) {
    // Table missing → serve hardcoded defaults so the UI/forms keep working.
    if (error.code === UNDEFINED_TABLE) {
      const keys = listKey ? [listKey] : OPTION_LIST_KEYS;
      const rows = keys.flatMap((k) => defaultRowsFor(k));
      return NextResponse.json({ data: rows, tableReady: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: (data as OptionListRow[]) ?? [], tableReady: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const listKey = typeof body.list_key === 'string' ? body.list_key : '';
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : value;

  if (!isValidListKey(listKey)) {
    return NextResponse.json({ error: 'list_key לא חוקי' }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: 'ערך הוא שדה חובה' }, { status: 400 });
  }

  // Next sort_order = max(existing for this key) + 1.
  const { data: existing, error: maxErr } = await supabase
    .from('system_option_lists')
    .select('sort_order')
    .eq('list_key', listKey)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (maxErr?.code === UNDEFINED_TABLE) {
    return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
  }
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('system_option_lists')
    .insert({ list_key: listKey, value, label, sort_order: nextSort, is_active: true, is_system: false })
    .select('id, list_key, value, label, sort_order, is_active, is_system')
    .single();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: `הערך "${value}" כבר קיים ברשימה` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity({
    actor: (await getActorFromRequest()) ?? undefined,
    module: 'settings',
    action: 'option_list.create',
    entityType: 'system_option_lists',
    entityId: data.id,
    entityLabel: value,
    title: `נוסף ערך לרשימה: ${getListDef(listKey)?.label ?? listKey}`,
    description: value,
    newValue: { list_key: listKey, value, label },
    request: req,
  });

  return NextResponse.json({ data }, { status: 201 });
}
