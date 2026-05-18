import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

type CreditType = 'credit_added' | 'credit_used' | 'credit_adjustment';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('זיכויי_לקוחות')
    .select('*')
    .eq('לקוח_id', params.id)
    .order('תאריך_יצירה', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const transactions = data ?? [];
  const balance = transactions.reduce((sum: number, t: { סכום?: number | string | null }) => sum + Number(t['סכום'] ?? 0), 0);

  return NextResponse.json({ balance: Math.round(balance * 100) / 100, transactions });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const body = await req.json() as {
    סכום: number;
    סוג: CreditType;
    סיבה?: string;
    הזמנה_id?: string | null;
  };

  const { סכום, סוג, סיבה, הזמנה_id } = body;

  if (typeof סכום !== 'number' || !Number.isFinite(סכום) || סכום === 0) {
    return NextResponse.json({ error: 'סכום חייב להיות מספר שאינו אפס' }, { status: 400 });
  }
  if (!['credit_added', 'credit_used', 'credit_adjustment'].includes(סוג)) {
    return NextResponse.json({ error: 'סוג לא תקין' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('זיכויי_לקוחות')
    .insert({
      'לקוח_id':     params.id,
      'סכום':         Math.round(סכום * 100) / 100,
      'סוג':          סוג,
      'סיבה':         סיבה?.trim() || null,
      'הזמנה_id':    הזמנה_id || null,
      'נוצר_על_ידי': auth.email ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
