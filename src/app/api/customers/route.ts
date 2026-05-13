export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const type = searchParams.get('type');
  const sort = searchParams.get('sort'); // 'name' = א׳-ת׳ by שם_פרטי+שם_משפחה. Default: newest first.
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // Hebrew text under the default UTF-8 ordering sorts by code point, which
  // matches the א-ת alphabet (U+05D0..U+05EA) — no special collation needed.
  // Existing callers that don't pass `sort` keep the prior "newest first"
  // behavior unchanged (additive change, no contract break).
  let query = supabase
    .from('לקוחות')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1);

  if (sort === 'name') {
    query = query
      .order('שם_פרטי', { ascending: true })
      .order('שם_משפחה', { ascending: true });
  } else {
    query = query.order('תאריך_יצירה', { ascending: false });
  }

  if (search) {
    query = query.or(`שם_פרטי.ilike.%${search}%,שם_משפחה.ilike.%${search}%,טלפון.ilike.%${search}%,אימייל.ilike.%${search}%`);
  }
  if (type) {
    query = query.eq('סוג_לקוח', type);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  const customer = {
    שם_פרטי: body.שם_פרטי,
    שם_משפחה: body.שם_משפחה || '',
    טלפון: body.טלפון || null,
    אימייל: body.אימייל || null,
    סוג_לקוח: body.סוג_לקוח || 'פרטי',
    סטטוס_לקוח: body.סטטוס_לקוח || 'פעיל',
    מקור_הגעה: body.מקור_הגעה || null,
    אחוז_הנחה: body.אחוז_הנחה || 0,
    הערות: body.הערות || null,
    // Saved address (migration 022). Empty string normalizes to null so we
    // don't write "" rows that would later evaluate as truthy on autofill.
    כתובת: typeof body.כתובת === 'string' && body.כתובת.trim() ? body.כתובת.trim() : null,
    עיר: typeof body.עיר === 'string' && body.עיר.trim() ? body.עיר.trim() : null,
    הערות_כתובת: typeof body.הערות_כתובת === 'string' && body.הערות_כתובת.trim() ? body.הערות_כתובת.trim() : null,
  };

  if (!customer.שם_פרטי) {
    return NextResponse.json({ error: 'שם פרטי הוא שדה חובה' }, { status: 400 });
  }

  const { data, error } = await supabase.from('לקוחות').insert(customer).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logActivity({
    actor:        userActor(auth),
    module:       'customers',
    action:       'customer_created',
    status:       'success',
    entityType:   'customer',
    entityId:     String(data.id),
    entityLabel:  `${customer.שם_פרטי} ${customer.שם_משפחה}`.trim(),
    title:        'נוצר לקוח חדש',
    description:  customer.טלפון || customer.אימייל || null,
    metadata:     { customer_type: customer.סוג_לקוח },
    request:      req,
  });

  return NextResponse.json({ data }, { status: 201 });
}
