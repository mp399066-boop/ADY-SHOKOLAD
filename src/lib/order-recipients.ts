import { createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Multi-recipient orders (הזמנה לכמה נמענים)
//
// One paying customer, one order, one total/invoice/payment — but the order
// is *fulfilled* to several people, each with their own address and greeting,
// each possibly receiving different items.
//
// Data model (migration 053):
//   נמעני_הזמנה                  one row per recipient of an order
//   מוצרים_בהזמנה.נמען_id       which recipient a line is for (NULL = order-wide)
//   משלוחים.נמען_id             one delivery row per recipient
//   הזמנות.מרובה_נמענים          flag so readers know to fan out
//
// Everything here is written so the app keeps working BEFORE migration 053 is
// applied: a classic single-recipient order never touches any of the new
// columns, and reads fall back to an empty recipients list.
// ---------------------------------------------------------------------------

// Same convention as inventory-deduct / system-services: the service-role
// client is intentionally untyped because the Hebrew column names are not in
// the generated DB types.
type DB = ReturnType<typeof createAdminClient>;

export const MAX_RECIPIENTS = 300;
const MAX_TEXT = 300;
const MAX_LONG_TEXT = 1000;

export interface RecipientInput {
  /** Client-side key used to link item rows to this recipient before it has a DB id. */
  key: string;
  שם_נמען: string;
  טלפון_נמען: string | null;
  כתובת: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  ברכה_טקסט: string | null;
  הערות: string | null;
}

export interface RecipientRow {
  id: string;
  הזמנה_id: string;
  שם_נמען: string;
  טלפון_נמען: string | null;
  כתובת: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  ברכה_טקסט: string | null;
  הערות: string | null;
  סדר_תצוגה: number;
}

/** Recipients-schema-missing detector — migration 053 not applied yet. */
export function isMissingRecipientSchema(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42P01 = undefined_table, 42703 = undefined_column, PGRST205 = table not in
  // the PostgREST schema cache.
  if (err.code === '42P01' || err.code === '42703' || err.code === 'PGRST205') return true;
  const m = err.message || '';
  return m.includes('נמעני_הזמנה') || m.includes('נמען_id');
}

export const MISSING_SCHEMA_MESSAGE =
  'התכונה "הזמנה לכמה נמענים" עדיין לא הופעלה במסד הנתונים — יש להריץ את מיגרציה 053_order_multi_recipients.sql';

function str(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * Validates + normalizes the `נמענים` array coming off a request body.
 * Never trusts the client: unknown fields are dropped, strings are trimmed and
 * length-capped, nameless entries are discarded, and the list is capped.
 * Returns `[]` for anything that isn't a usable recipients array.
 */
export function normalizeRecipients(raw: unknown): RecipientInput[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipientInput[] = [];
  for (let i = 0; i < raw.length && out.length < MAX_RECIPIENTS; i++) {
    const r = raw[i];
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const name = str(rec['שם_נמען']);
    // A recipient with no name is an empty UI row — silently skipped rather
    // than failing the whole order.
    if (!name) continue;
    const key = str(rec['key']) || `r${i}`;
    out.push({
      key,
      שם_נמען: name,
      טלפון_נמען: str(rec['טלפון_נמען'], 40),
      כתובת: str(rec['כתובת']),
      עיר: str(rec['עיר'], 120),
      הוראות_משלוח: str(rec['הוראות_משלוח'], MAX_LONG_TEXT),
      ברכה_טקסט: str(rec['ברכה_טקסט'], MAX_LONG_TEXT),
      הערות: str(rec['הערות'], MAX_LONG_TEXT),
    });
  }
  // Deduplicate client keys — two rows sharing a key would silently merge
  // their item assignments.
  const seen = new Set<string>();
  return out.map((r, i) => {
    const next = seen.has(r.key) ? { ...r, key: `${r.key}__${i}` } : r;
    seen.add(next.key);
    return next;
  });
}

/**
 * Replaces the recipients of an order with `recipients` and returns the
 * client-key → DB-id map used to stamp item rows.
 *
 * Deleting first is safe: item rows point at recipients with ON DELETE SET
 * NULL and delivery rows with ON DELETE CASCADE, and every caller re-inserts
 * the items in the same request.
 */
export async function replaceOrderRecipients(
  supabase: DB,
  orderId: string,
  recipients: RecipientInput[],
): Promise<{ ok: true; map: Map<string, string>; rows: RecipientRow[] } | { ok: false; error: string }> {
  const { error: delErr } = await supabase.from('נמעני_הזמנה').delete().eq('הזמנה_id', orderId);
  if (delErr) {
    if (isMissingRecipientSchema(delErr)) return { ok: false, error: MISSING_SCHEMA_MESSAGE };
    return { ok: false, error: `מחיקת נמענים קודמים נכשלה: ${delErr.message}` };
  }

  if (recipients.length === 0) return { ok: true, map: new Map(), rows: [] };

  const payload = recipients.map((r, idx) => ({
    הזמנה_id: orderId,
    שם_נמען: r.שם_נמען,
    טלפון_נמען: r.טלפון_נמען,
    כתובת: r.כתובת,
    עיר: r.עיר,
    הוראות_משלוח: r.הוראות_משלוח,
    ברכה_טקסט: r.ברכה_טקסט,
    הערות: r.הערות,
    סדר_תצוגה: idx + 1,
  }));

  const { data, error } = await supabase.from('נמעני_הזמנה').insert(payload).select();
  if (error) {
    if (isMissingRecipientSchema(error)) return { ok: false, error: MISSING_SCHEMA_MESSAGE };
    return { ok: false, error: `יצירת נמענים נכשלה: ${error.message}` };
  }

  const rows = (data || []) as RecipientRow[];
  // insert() preserves input order in the returned rows, but סדר_תצוגה is the
  // contract — match on it rather than relying on array position.
  const byOrder = new Map<number, RecipientRow>();
  for (const row of rows) byOrder.set(Number(row.סדר_תצוגה), row);

  const map = new Map<string, string>();
  recipients.forEach((r, idx) => {
    const row = byOrder.get(idx + 1);
    if (row) map.set(r.key, row.id);
  });

  return { ok: true, map, rows: rows.slice().sort((a, b) => Number(a.סדר_תצוגה) - Number(b.סדר_תצוגה)) };
}

/** Resolves an item's client-side recipient key to a DB id (null when unassigned). */
export function recipientIdFor(map: Map<string, string>, raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return map.get(raw.trim()) ?? null;
}

/**
 * Extra columns for an order-line insert. Returns an empty object when the
 * order has no recipients, so single-recipient orders never reference the
 * new column at all (and keep working before migration 053 is applied).
 */
export function itemRecipientColumns(
  map: Map<string, string>,
  item: Record<string, unknown> | null | undefined,
): { נמען_id?: string } {
  if (map.size === 0) return {};
  const id = recipientIdFor(map, item?.['נמען_key']);
  return id ? { נמען_id: id } : {};
}

export interface DeliveryDefaults {
  תאריך_משלוח: string | null;
  שעת_משלוח: string | null;
  /** Order-level fallbacks used when a recipient has no address of their own. */
  כתובת: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
}

/**
 * Creates one משלוחים row per recipient.
 *
 * Status is always 'ממתין' — a brand-new delivery has not been handed to a
 * courier (same reasoning as the single-delivery paths in create-full /
 * finalize-draft). Existing rows are left alone apart from address/date sync,
 * so re-running never resets a delivery that is already on the road.
 *
 * The order-level row (נמען_id IS NULL) is removed when recipients exist —
 * otherwise the deliveries board would show a phantom extra stop.
 */
export async function syncRecipientDeliveries(
  supabase: DB,
  orderId: string,
  recipients: RecipientRow[],
  defaults: DeliveryDefaults,
): Promise<void> {
  if (recipients.length === 0) return;

  const { data: existingRaw, error: readErr } = await supabase
    .from('משלוחים')
    .select('id, נמען_id, סטטוס_משלוח')
    .eq('הזמנה_id', orderId);

  if (readErr) {
    console.error('[order-recipients] delivery read failed:', readErr.message, '| order:', orderId);
    return;
  }

  const existing = (existingRaw || []) as { id: string; נמען_id: string | null; סטטוס_משלוח: string }[];
  const byRecipient = new Map<string, string>();
  for (const row of existing) if (row.נמען_id) byRecipient.set(row.נמען_id, row.id);

  for (const rec of recipients) {
    const row = {
      תאריך_משלוח: defaults.תאריך_משלוח,
      שעת_משלוח: defaults.שעת_משלוח,
      כתובת: rec.כתובת || defaults.כתובת,
      עיר: rec.עיר || defaults.עיר,
      הוראות_משלוח: rec.הוראות_משלוח || defaults.הוראות_משלוח,
    };
    const existingId = byRecipient.get(rec.id);
    if (existingId) {
      const { error } = await supabase.from('משלוחים').update(row).eq('id', existingId);
      if (error) console.error('[order-recipients] delivery update failed:', error.message, '| delivery:', existingId);
      continue;
    }
    const { error } = await supabase
      .from('משלוחים')
      .insert({ הזמנה_id: orderId, נמען_id: rec.id, סטטוס_משלוח: 'ממתין', ...row });
    // 23505 = the partial unique index won a race; the row exists, nothing to do.
    if (error && error.code !== '23505') {
      console.error('[order-recipients] delivery insert failed:', error.message, '| order:', orderId, '| recipient:', rec.id);
    }
  }

  // Drop the order-level placeholder row — deliveries are now per recipient.
  // A row already marked נמסר is history and is never deleted.
  const orderLevel = existing.filter(r => !r.נמען_id && r.סטטוס_משלוח !== 'נמסר');
  for (const row of orderLevel) {
    const { error } = await supabase.from('משלוחים').delete().eq('id', row.id);
    if (error) console.error('[order-recipients] order-level delivery cleanup failed:', error.message, '| delivery:', row.id);
  }
}

/**
 * Attaches the recipient row to each delivery that has a נמען_id, under the
 * `נמעני_הזמנה` key — the same shape a PostgREST embed would produce.
 *
 * Done as a follow-up query instead of an embed on purpose: an embed would
 * make the whole deliveries board fail on databases where migration 053 is
 * not applied yet. Here, no נמען_id means no query and no change.
 */
export async function attachDeliveryRecipients<T extends Record<string, unknown>>(
  supabase: DB,
  rows: T[],
): Promise<T[]> {
  const ids = Array.from(
    new Set(rows.map(r => r['נמען_id']).filter((v): v is string => typeof v === 'string' && !!v)),
  );
  if (ids.length === 0) return rows;

  const { data, error } = await supabase.from('נמעני_הזמנה').select('*').in('id', ids);
  if (error) {
    if (!isMissingRecipientSchema(error)) {
      console.error('[order-recipients] delivery recipient join failed:', error.message);
    }
    return rows;
  }

  const byId = new Map<string, RecipientRow>();
  for (const row of (data || []) as RecipientRow[]) byId.set(row.id, row);
  return rows.map(r => {
    const rid = r['נמען_id'];
    if (typeof rid !== 'string' || !byId.has(rid)) return r;
    return { ...r, 'נמעני_הזמנה': byId.get(rid) };
  });
}

/**
 * The recipient a single delivery serves, or null for a classic single-stop
 * order. Read in two tolerant steps rather than one embed so callers whose
 * main query predates migration 053 don't have to reference נמען_id at all.
 */
export async function fetchDeliveryRecipient(supabase: DB, deliveryId: string): Promise<RecipientRow | null> {
  const { data, error } = await supabase
    .from('משלוחים')
    .select('נמען_id')
    .eq('id', deliveryId)
    .maybeSingle();
  if (error || !data) return null;

  const recipientId = (data as Record<string, unknown>)['נמען_id'];
  if (typeof recipientId !== 'string' || !recipientId) return null;

  const { data: rec, error: recErr } = await supabase
    .from('נמעני_הזמנה')
    .select('*')
    .eq('id', recipientId)
    .maybeSingle();
  if (recErr || !rec) return null;
  return rec as RecipientRow;
}

/** Reads an order's recipients. Returns [] when migration 053 isn't applied. */
export async function fetchOrderRecipients(supabase: DB, orderId: string): Promise<RecipientRow[]> {
  const { data, error } = await supabase
    .from('נמעני_הזמנה')
    .select('*')
    .eq('הזמנה_id', orderId)
    .order('סדר_תצוגה', { ascending: true });
  if (error) {
    if (!isMissingRecipientSchema(error)) {
      console.error('[order-recipients] fetch failed:', error.message, '| order:', orderId);
    }
    return [];
  }
  return (data || []) as RecipientRow[];
}
