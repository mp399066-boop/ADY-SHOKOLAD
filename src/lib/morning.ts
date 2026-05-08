// Calls the Morning Edge Function to create a tax_invoice or receipt for an order.
// Idempotency is enforced inside the Edge Function by (הזמנה_id + סוג_מסמך).
// Amounts are read from the DB by the Edge Function itself — never accept them from the client.
export async function callMorning(orderId: string, documentType: 'tax_invoice' | 'receipt'): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error('[invoice] Missing env vars — SUPABASE_URL:', !!supabaseUrl, '| SERVICE_ROLE_KEY:', !!serviceRoleKey, '| WEBHOOK_SECRET:', !!webhookSecret);
    return;
  }
  try {
    console.log('[invoice] Calling Morning for', documentType, '— order:', orderId);
    const res = await fetch(`${supabaseUrl}/functions/v1/create-morning-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({
        type: 'UPDATE',
        table: 'הזמנות',
        document_type: documentType,
        record: { הזמנה_id: orderId },
        old_record: {},
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.error('[invoice] Morning failed:', res.status, JSON.stringify(body));
    else console.log('[invoice] Morning success:', JSON.stringify(body));
  } catch (err) {
    console.error('[invoice] Failed to call Morning:', err instanceof Error ? err.message : err);
  }
}
