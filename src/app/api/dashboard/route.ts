export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createAdminClient();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [
    { count: ordersToday },
    { count: ordersTomorrow },
    { count: urgentOrders },
    { count: unpaidOrders },
    { count: inPreparation },
    { count: readyForDelivery },
    { count: shipped },
    { count: lowInventory },
    { count: deliveriesToday },
    { data: unpaidRows },
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
}
