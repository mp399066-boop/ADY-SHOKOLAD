export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const hasUrl        = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasAnonKey    = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    const urlHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname; } catch { return 'invalid-url'; } })()
      : 'MISSING';

    console.log('[dashboard] env check:', { hasUrl, hasAnonKey, hasServiceKey, urlHostname });

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

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [
      { count: ordersToday, error: e1 },
      { count: ordersTomorrow, error: e2 },
      { count: urgentOrders, error: e3 },
      { count: unpaidOrders, error: e4 },
      { count: inPreparation, error: e5 },
      { count: readyForDelivery, error: e6 },
      { count: shipped, error: e7 },
      { count: lowInventory, error: e8 },
      { count: deliveriesToday, error: e9 },
      { data: unpaidRows, error: e10 },
    ] = await Promise.all([
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', today).neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', tomorrow).neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('הזמנה_דחופה', true).neq('סטטוס_הזמנה', 'הושלמה בהצלחה').neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_תשלום', 'ממתין').neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_הזמנה', 'בהכנה'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_הזמנה', 'מוכנה למשלוח'),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('סטטוס_הזמנה', 'נשלחה'),
      supabase.from('מלאי_חומרי_גלם').select('*', { count: 'exact', head: true }).in('סטטוס_מלאי', ['מלאי נמוך', 'קריטי', 'אזל מהמלאי']),
      supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', today).eq('סוג_אספקה', 'משלוח').neq('סטטוס_הזמנה', 'בוטלה'),
      supabase.from('הזמנות').select('סך_הכל_לתשלום').eq('סטטוס_תשלום', 'ממתין').neq('סטטוס_הזמנה', 'בוטלה'),
    ]);

    const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10;
    if (firstError) {
      const msg =
        firstError.message ||
        firstError.details ||
        firstError.hint ||
        JSON.stringify(firstError) ||
        'Unknown dashboard error';
      console.error('[dashboard] supabase error:', firstError);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const unpaidAmount = (unpaidRows ?? []).reduce(
      (sum: number, row: any) => sum + (row['סך_הכל_לתשלום'] ?? 0),
      0,
    );

    return NextResponse.json({
      data: {
        ordersToday: ordersToday ?? 0,
        ordersTomorrow: ordersTomorrow ?? 0,
        urgentOrders: urgentOrders ?? 0,
        unpaidOrders: unpaidOrders ?? 0,
        inPreparation: inPreparation ?? 0,
        readyForDelivery: readyForDelivery ?? 0,
        shipped: shipped ?? 0,
        lowInventory: lowInventory ?? 0,
        deliveriesToday: deliveriesToday ?? 0,
        unpaidAmount,
      },
    });
  } catch (err: any) {
    console.error('[dashboard] unexpected error:', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'שגיאת שרת' }, { status: 500 });
  }
}
