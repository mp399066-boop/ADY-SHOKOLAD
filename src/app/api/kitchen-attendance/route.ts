export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const TZ = 'Asia/Jerusalem';

function nowParts() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return { date, time };
}

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const { date: today } = nowParts();
  const from = searchParams.get('from') || today;
  const to = searchParams.get('to') || today;
  const workerId = searchParams.get('workerId') || '';

  const [workersRes, todayRes, staleOpenRes] = await Promise.all([
    supabase
      .from('עובדות_מטבח')
      .select('*')
      .order('פעילה', { ascending: false })
      .order('שם_עובדת', { ascending: true }),
    supabase
      .from('נוכחות_עובדות')
      .select('*, עובדות_מטבח(שם_עובדת)')
      .eq('תאריך', today)
      .order('תאריך_יצירה', { ascending: false }),
    supabase
      .from('נוכחות_עובדות')
      .select('*, עובדות_מטבח(שם_עובדת)')
      .eq('סטטוס', 'פתוח')
      .lt('תאריך', today)
      .order('תאריך', { ascending: false }),
  ]);

  if (workersRes.error) return NextResponse.json({ error: workersRes.error.message }, { status: 500 });
  if (todayRes.error) return NextResponse.json({ error: todayRes.error.message }, { status: 500 });
  if (staleOpenRes.error) return NextResponse.json({ error: staleOpenRes.error.message }, { status: 500 });

  let reportQuery = supabase
    .from('נוכחות_עובדות')
    .select('*, עובדות_מטבח(שם_עובדת)')
    .gte('תאריך', from)
    .lte('תאריך', to)
    .order('תאריך', { ascending: false })
    .order('תאריך_יצירה', { ascending: false });
  if (workerId) reportQuery = reportQuery.eq('עובדת_id', workerId);

  const { data: report, error: reportErr } = await reportQuery;
  if (reportErr) return NextResponse.json({ error: reportErr.message }, { status: 500 });

  return NextResponse.json({
    workers: workersRes.data || [],
    todayAttendance: todayRes.data || [],
    staleOpenAttendance: staleOpenRes.data || [],
    report: report || [],
    today,
    isAdmin: auth.role === 'admin',
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const body = await req.json();
  const workerId = String(body.workerId || '').trim();
  const notes = typeof body.הערות === 'string' ? body.הערות.trim() : null;
  if (!workerId) return NextResponse.json({ error: 'חסרה עובדת' }, { status: 400 });

  const { data: worker, error: workerErr } = await supabase
    .from('עובדות_מטבח')
    .select('id, פעילה')
    .eq('id', workerId)
    .maybeSingle();
  if (workerErr) return NextResponse.json({ error: workerErr.message }, { status: 500 });
  if (!worker || worker.פעילה === false) return NextResponse.json({ error: 'עובדת לא פעילה' }, { status: 400 });

  const { data: openRows, error: openErr } = await supabase
    .from('נוכחות_עובדות')
    .select('id, תאריך')
    .eq('עובדת_id', workerId)
    .eq('סטטוס', 'פתוח')
    .limit(1);
  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });
  if ((openRows || []).length > 0) {
    return NextResponse.json({ error: 'כבר קיימת כניסה פתוחה לעובדת הזו' }, { status: 409 });
  }

  const { date, time } = nowParts();
  const { data, error } = await supabase
    .from('נוכחות_עובדות')
    .insert({
      עובדת_id: workerId,
      תאריך: date,
      שעת_כניסה: time,
      סטטוס: 'פתוח',
      הערות: notes || null,
    })
    .select('*, עובדות_מטבח(שם_עובדת)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
