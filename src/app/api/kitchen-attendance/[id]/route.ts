export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  forbiddenResponse,
  requireManagementUser,
  unauthorizedResponse,
} from '@/lib/auth/requireAuthorizedUser';

const TZ = 'Asia/Jerusalem';

function currentTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function hoursBetween(date: string, start: string, end: string): number {
  let a = new Date(`${date}T${start}`);
  let b = new Date(`${date}T${end}`);
  if (b.getTime() < a.getTime()) b = new Date(b.getTime() + 24 * 60 * 60 * 1000);
  return Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 100) / 100;
}

function statusFor(date: string, inTime?: string | null, outTime?: string | null): 'פתוח' | 'הושלם' | 'חסרה יציאה' {
  if (inTime && outTime) return 'הושלם';
  if (inTime && date < todayISO()) return 'חסרה יציאה';
  return 'פתוח';
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const body = await req.json();

  if (body.action === 'clock_out') {
    const { data: row, error: fetchErr } = await supabase
      .from('נוכחות_עובדות')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'רשומת נוכחות לא נמצאה' }, { status: 404 });
    if (row.סטטוס !== 'פתוח' || row.שעת_יציאה) {
      return NextResponse.json({ error: 'אין כניסה פתוחה לסגירה' }, { status: 409 });
    }

    const outTime = currentTime();
    const total = hoursBetween(row.תאריך, row.שעת_כניסה, outTime);
    const { data, error } = await supabase
      .from('נוכחות_עובדות')
      .update({
        שעת_יציאה: outTime,
        סהכ_שעות: total,
        סטטוס: 'הושלם',
        תאריך_עדכון: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('*, עובדות_מטבח(שם_עובדת)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (auth.role !== 'admin') return forbiddenResponse();

  const patch: Record<string, unknown> = {};
  if ('עובדת_id' in body) patch.עובדת_id = body.עובדת_id || null;
  if ('תאריך' in body) patch.תאריך = body.תאריך;
  if ('שעת_כניסה' in body) patch.שעת_כניסה = body.שעת_כניסה || null;
  if ('שעת_יציאה' in body) patch.שעת_יציאה = body.שעת_יציאה || null;
  if ('הערות' in body) patch.הערות = body.הערות || null;

  const date = String(patch.תאריך || body.תאריך || '');
  const inTime = String(patch.שעת_כניסה || body.שעת_כניסה || '');
  const outTime = String(patch.שעת_יציאה || body.שעת_יציאה || '');
  if (date && inTime && outTime) patch.סהכ_שעות = hoursBetween(date, inTime, outTime);
  else patch.סהכ_שעות = null;
  if (date && inTime) patch.סטטוס = statusFor(date, inTime, outTime || null);
  if ('סטטוס' in body && ['פתוח', 'הושלם', 'חסרה יציאה'].includes(body.סטטוס)) patch.סטטוס = body.סטטוס;
  patch.תאריך_עדכון = new Date().toISOString();

  const { data, error } = await supabase
    .from('נוכחות_עובדות')
    .update(patch)
    .eq('id', params.id)
    .select('*, עובדות_מטבח(שם_עובדת)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
