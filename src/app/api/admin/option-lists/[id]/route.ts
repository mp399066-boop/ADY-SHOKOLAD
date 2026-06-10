// ============================================================================
// /api/admin/option-lists/[id]
//
// PATCH  — edit label / value / sort_order / is_active (disable).
// DELETE — hard delete, blocked when the value is a seeded default (is_system)
//          or is currently in use by orders/products/etc. → caller is told to
//          disable instead. This is what keeps existing data working.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, getActorFromRequest } from '@/lib/activity-log';
import { getListDef } from '@/lib/option-lists';

const UNDEFINED_TABLE = '42P01';
const MIGRATION_HINT = 'טבלת הרשימות אינה קיימת עדיין. יש להריץ את מיגרציה 049 ב-Supabase.';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** Count records still referencing `value` across the list's usage tables. */
async function valueUsageCount(
  supabase: SupabaseAdmin,
  listKey: string,
  value: string,
): Promise<number> {
  const def = getListDef(listKey);
  if (!def) return 0;
  let total = 0;
  for (const { table, column } of def.usage) {
    const { count, error } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true })
      .eq(column, value);
    // A missing/renamed table must never block management — treat as 0.
    if (!error && typeof count === 'number') total += count;
  }
  return total;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const { data: row, error: fetchErr } = await supabase
    .from('system_option_lists')
    .select('id, list_key, value, label, is_active, is_system')
    .eq('id', params.id)
    .single();
  if (fetchErr) {
    if (fetchErr.code === UNDEFINED_TABLE) return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
    return NextResponse.json({ error: 'ערך לא נמצא' }, { status: 404 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.label === 'string' && body.label.trim()) payload.label = body.label.trim();
  if (typeof body.sort_order === 'number') payload.sort_order = body.sort_order;
  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;

  // Renaming the canonical value is restricted: it would orphan existing
  // records that store the old string, and system defaults mirror hardcoded
  // constants. Label edits are always fine.
  if (typeof body.value === 'string' && body.value.trim() && body.value.trim() !== row.value) {
    const newValue = body.value.trim();
    if (row.is_system) {
      return NextResponse.json(
        { error: 'לא ניתן לשנות ערך של פריט ברירת מחדל. ניתן לשנות רק את התווית או להשבית.' },
        { status: 409 },
      );
    }
    const used = await valueUsageCount(supabase, row.list_key, row.value);
    if (used > 0) {
      return NextResponse.json(
        { error: `הערך בשימוש ב-${used} רשומות ולכן לא ניתן לשנות אותו. ניתן להשבית ולהוסיף ערך חדש.` },
        { status: 409 },
      );
    }
    payload.value = newValue;
  }

  const { data, error } = await supabase
    .from('system_option_lists')
    .update(payload)
    .eq('id', params.id)
    .select('id, list_key, value, label, sort_order, is_active, is_system')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'ערך זהה כבר קיים ברשימה' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const wasDisabled = body.is_active === false && row.is_active === true;
  await logActivity({
    actor: (await getActorFromRequest()) ?? undefined,
    module: 'settings',
    action: wasDisabled ? 'option_list.disable' : 'option_list.update',
    entityType: 'system_option_lists',
    entityId: row.id,
    entityLabel: row.value,
    title: `${wasDisabled ? 'הושבת' : 'עודכן'} ערך ברשימה: ${getListDef(row.list_key)?.label ?? row.list_key}`,
    description: data.value,
    oldValue: { value: row.value, label: row.label, is_active: row.is_active },
    newValue: { value: data.value, label: data.label, is_active: data.is_active },
    request: req,
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from('system_option_lists')
    .select('id, list_key, value, is_system')
    .eq('id', params.id)
    .single();
  if (fetchErr) {
    if (fetchErr.code === UNDEFINED_TABLE) return NextResponse.json({ error: MIGRATION_HINT }, { status: 400 });
    return NextResponse.json({ error: 'ערך לא נמצא' }, { status: 404 });
  }

  if (row.is_system) {
    return NextResponse.json(
      { error: 'זהו ערך ברירת מחדל ולא ניתן למחוק אותו. ניתן להשבית אותו במקום.' },
      { status: 409 },
    );
  }

  const used = await valueUsageCount(supabase, row.list_key, row.value);
  if (used > 0) {
    return NextResponse.json(
      { error: `הערך בשימוש ב-${used} רשומות ולכן לא ניתן למחוק אותו. ניתן להשבית אותו במקום.` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from('system_option_lists').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actor: (await getActorFromRequest()) ?? undefined,
    module: 'settings',
    action: 'option_list.delete',
    entityType: 'system_option_lists',
    entityId: row.id,
    entityLabel: row.value,
    title: `נמחק ערך מרשימה: ${getListDef(row.list_key)?.label ?? row.list_key}`,
    description: row.value,
    oldValue: { value: row.value },
    request: req,
  });

  return NextResponse.json({ success: true });
}
