export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  try {
    const hasUrl        = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasAnonKey    = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    const urlHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname; } catch { return 'invalid-url'; } })()
      : 'MISSING';

    if (!hasUrl || !hasServiceKey) {
      return NextResponse.json(
        {
          error: true,
          message: 'Missing Supabase environment variables — add them in Vercel Settings → Environment Variables',
          env: { hasUrl, hasAnonKey, hasServiceKey },
        },
        { status: 500 },
      );
    }

    const supabase = createAdminClient();

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

    const [
      { count: ordersToday,        error: e1  },
      { count: ordersTomorrow,     error: e2  },
      { count: urgentOrders,       error: e3  },
      { count: unpaidOrders,       error: e4  },
      { count: inPreparation,      error: e5  },
      { count: readyForDelivery,   error: e6  },
      { count: shipped,            error: e7  },
      { count: lowInventory,       error: e8  },
      { count: deliveriesToday,    error: e9  },
      { data: unpaidRows,          error: e10 },
      { count: deliveriesCollected, error: e11 },
      { count: deliveriesDelivered, error: e12 },
      { data: revenueTodayRows,    error: e13 },
    ] = await Promise.all([
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', today).neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', tomorrow).neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('הזמנה_דחופה', true).neq('סטטוס_הזמנה', 'הושלמה בהצלחה').neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_תשלום', 'ממתין').neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_הזמנה', 'בהכנה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_הזמנה', 'מוכנה למשלוח'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_הזמנה', 'נשלחה'),
      supabase.from('מלאי_חומרי_גלם').select('*', { count: 'exact', head: true }).in('סטטוס_מלאי', ['מלאי נמוך', 'קריטי', 'אזל מהמלאי']),
      supabase.from('משלוחים').select('*', { count: 'exact', head: true }).eq('תאריך_משלוח', today),
      supabase.from('הזמנות').select('סך_הכל_לתשלום').eq('סטטוס_תשלום', 'ממתין').neq('סטטוס_הזמנה', 'בוטלה'),
      // deliveries by status (all time, not just today — reflects current pipeline state)
      supabase.from('משלוחים').select('*', { count: 'exact', head: true }).eq('סטטוס_משלוח', 'נאסף'),
      supabase.from('משלוחים').select('*', { count: 'exact', head: true }).eq('סטטוס_משלוח', 'נמסר'),
      // revenue: paid orders with delivery date = today
      supabase.from('הזמנות').select('סך_הכל_לתשלום').eq('תאריך_אספקה', today).eq('סטטוס_תשלום', 'שולם'),
    ]);

    // Diagnostic: log calculated dates and raw results
    console.log('[dashboard] today:', today, '| tomorrow:', tomorrow);
    console.log('[dashboard] counts:', {
      ordersToday, ordersTomorrow, urgentOrders, unpaidOrders,
      inPreparation, readyForDelivery, shipped, lowInventory,
      deliveriesToday, deliveriesCollected, deliveriesDelivered,
    });
    console.log('[dashboard] errors:', {
      e1: e1?.message, e2: e2?.message, e3: e3?.message, e4: e4?.message,
      e5: e5?.message, e6: e6?.message, e7: e7?.message, e8: e8?.message,
      e9: e9?.message, e10: e10?.message, e11: e11?.message, e12: e12?.message, e13: e13?.message,
    });
    console.log('[dashboard] revenue rows:', revenueTodayRows?.length ?? 'null', '| unpaid rows:', unpaidRows?.length ?? 'null');

    // Diagnostic: check actual column names in DB
    const { data: sampleOrder } = await supabase.from('הזמנות').select('*').limit(1).maybeSingle();
    if (sampleOrder) console.log('[dashboard] sample order keys:', Object.keys(sampleOrder).join(', '));
    else console.log('[dashboard] no orders found in table');

    const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10 || e11 || e12 || e13;
    if (firstError) {
      const msg = firstError.message || firstError.details || firstError.hint || 'שגיאה בטעינת הנתונים';
      console.error('[dashboard] query error:', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const unpaidAmount = (unpaidRows ?? []).reduce(
      (sum: number, row: any) => sum + (row['סך_הכל_לתשלום'] ?? 0),
      0,
    );

    const revenueToday = (revenueTodayRows ?? []).reduce(
      (sum: number, row: any) => sum + (row['סך_הכל_לתשלום'] ?? 0),
      0,
    );

    return NextResponse.json({
      data: {
        ordersToday:          ordersToday          ?? 0,
        ordersTomorrow:       ordersTomorrow       ?? 0,
        urgentOrders:         urgentOrders         ?? 0,
        unpaidOrders:         unpaidOrders         ?? 0,
        inPreparation:        inPreparation        ?? 0,
        readyForDelivery:     readyForDelivery     ?? 0,
        shipped:              shipped              ?? 0,
        lowInventory:         lowInventory         ?? 0,
        deliveriesToday:      deliveriesToday      ?? 0,
        unpaidAmount,
        deliveriesCollected:  deliveriesCollected  ?? 0,
        deliveriesDelivered:  deliveriesDelivered  ?? 0,
        revenueToday,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'שגיאת שרת' }, { status: 500 });
  }
}
