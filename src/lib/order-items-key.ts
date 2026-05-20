// Stable identity for one row of `מוצרים_בהזמנה`. Used by:
//   • the server-side snapshot writer (so two saves of the same order
//     produce identical snapshot rows even though the items PUT route
//     wipes and re-inserts everything, regenerating row uuids), and
//   • the client order page (to decide whether "שלח סיכום הזמנה מעודכן"
//     should pulse — i.e. whether the current item set differs from the
//     last snapshot that was emailed to the customer).
//
// Kept in its own module — with NO server-only imports — so the client
// component can import it without pulling in @sendgrid/mail or the server
// Supabase client through @/lib/email.
export function getOrderItemContentKey(item: Record<string, unknown>): string {
  const rowType = item['סוג_שורה'] as string | undefined;
  if (rowType === 'מארז') {
    return `pkg:${item['גודל_מארז'] ?? ''}`;
  }
  if (rowType === 'מוצר_ידני' || rowType === 'תוספת_תשלום') {
    const rawName = (item['שם_פריט_מותאם'] as string | undefined) ?? '';
    const name    = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
    const price   = Number(item['מחיר_ליחידה'] ?? 0).toFixed(2);
    return `${rowType}:${name}:${price}`;
  }
  const prodId = item['מוצר_id'] as string | null | undefined;
  if (prodId) return `prod:${prodId}`;
  return `row:${item['id'] ?? ''}`;
}
