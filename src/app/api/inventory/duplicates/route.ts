export const dynamic = 'force-dynamic';

// זיהוי כפילויות בחומרי גלם.
//   GET  → רשימת הצעות pending עם שמות/כמויות של שני החומרים.
//   POST → סורק את כל חומרי הגלם ויוצר הצעות pending חדשות (ללא מיזוג!).
// שום פעולה כאן לא מוחקת, ממזגת או משנה כמויות.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { findDuplicatePairs, type DedupMaterial } from '@/lib/inventory-dedup';

interface MaterialRow {
  id: string;
  שם_חומר_גלם: string;
  כמות_במלאי: number;
  יחידת_מידה: string;
}

// Builds the enriched suggestion list for the review UI.
// status='pending' → new suggestions; status='approved' → already linked, still
// mergeable (backfill) since the link-only approve kept both rows.
async function listByStatus(supabase: ReturnType<typeof createAdminClient>, status: 'pending' | 'approved') {
  const { data: suggestions, error } = await supabase
    .from('raw_material_duplicate_suggestions')
    .select('id, primary_raw_material_id, duplicate_raw_material_id, reason, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = suggestions ?? [];
  const ids = Array.from(new Set(rows.flatMap((s: { primary_raw_material_id: string; duplicate_raw_material_id: string }) => [s.primary_raw_material_id, s.duplicate_raw_material_id])));
  const materialMap = new Map<string, MaterialRow>();
  if (ids.length > 0) {
    const { data: mats } = await supabase
      .from('מלאי_חומרי_גלם')
      .select('id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה')
      .in('id', ids);
    for (const m of (mats ?? []) as MaterialRow[]) materialMap.set(m.id, m);
  }

  // Only return suggestions where both materials still exist.
  return rows
    .map((s: { id: string; primary_raw_material_id: string; duplicate_raw_material_id: string; reason: string | null; status: string }) => {
      const primary = materialMap.get(s.primary_raw_material_id);
      const duplicate = materialMap.get(s.duplicate_raw_material_id);
      if (!primary || !duplicate) return null;
      return { id: s.id, reason: s.reason, status: s.status, primary, duplicate };
    })
    .filter(Boolean);
}

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  try {
    const [data, linked] = await Promise.all([
      listByStatus(supabase, 'pending'),
      listByStatus(supabase, 'approved'),
    ]);
    return NextResponse.json({ data, linked });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  // 1. Load all materials.
  const { data: mats, error: matErr } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('id, שם_חומר_גלם')
    .limit(2000);
  if (matErr) return NextResponse.json({ error: matErr.message }, { status: 500 });

  const materials: DedupMaterial[] = (mats ?? []).map((m: { id: string; שם_חומר_גלם: string }) => ({
    id: m.id, name: m.שם_חומר_גלם,
  }));

  // 2. Existing suggestions — skip any pair already approved/rejected so a
  //    rejected pair never re-appears. Pending ones are refreshed below.
  const { data: existing } = await supabase
    .from('raw_material_duplicate_suggestions')
    .select('primary_raw_material_id, duplicate_raw_material_id, status');
  const decided = new Set<string>();
  for (const s of (existing ?? []) as { primary_raw_material_id: string; duplicate_raw_material_id: string; status: string }[]) {
    if (s.status === 'approved' || s.status === 'rejected') {
      decided.add([s.primary_raw_material_id, s.duplicate_raw_material_id].sort().join('|'));
    }
  }

  // 3. Find pairs, drop decided ones.
  const pairs = findDuplicatePairs(materials).filter(
    p => !decided.has([p.primaryId, p.duplicateId].sort().join('|')),
  );

  // 4. Replace existing pending suggestions with the fresh scan result.
  await supabase.from('raw_material_duplicate_suggestions').delete().eq('status', 'pending');
  if (pairs.length > 0) {
    const { error: insErr } = await supabase
      .from('raw_material_duplicate_suggestions')
      .insert(pairs.map(p => ({
        primary_raw_material_id: p.primaryId,
        duplicate_raw_material_id: p.duplicateId,
        reason: p.reason,
        status: 'pending',
      })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  try {
    const [data, linked] = await Promise.all([
      listByStatus(supabase, 'pending'),
      listByStatus(supabase, 'approved'),
    ]);
    return NextResponse.json({ data, linked, scanned: materials.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 });
  }
}
