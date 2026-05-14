// Shared types for the assistant. All actions return AssistantResponse;
// the UI renders Block[] from `kind: 'answer'` responses.

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface ListItem {
  label: string;
  value?: string;
  sublabel?: string;
  tone?: Tone;
  emoji?: string;
}

export interface OrderSummary {
  id: string;
  number: string;
  customer: string;
  time: string | null;
  date: string;
  deliveryType: string;
  paymentStatus: string;
  urgent: boolean;
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'insight'; text: string; tone?: Tone; emoji?: string }
  | { type: 'stat'; label: string; value: string; sublabel?: string; tone?: Tone; emoji?: string }
  | { type: 'list'; title?: string; items: ListItem[] }
  | { type: 'orders'; title?: string; orders: OrderSummary[] }
  | { type: 'suggestions'; title?: string; items: ClarifyOption[] }
  | { type: 'download_button'; label: string; endpoint: string; payload: Record<string, unknown>; filenameHeader?: string }
  // Confirm-then-send card. Renders the recipient + range + filter summary
  // and asks the user to approve before posting to /api/reports/orders/send.
  // No email is sent until the user clicks "אשרי שליחה" — the server-side
  // action that produced this block did not call the send endpoint.
  | { type: 'confirm_send_report'; recipientEmail: string; rangeLabel: string; filtersLabel: string; payload: Record<string, unknown> }
  // Pre-action preview card. Single block that replaces the old "either
  // download_button or confirm_send_report" pair — the user always sees a
  // summary + first 5 orders before deciding. Both download and send
  // buttons live inside this block. Optional preferredAction hints the UI
  // which CTA to emphasise (e.g. user said "שלחי במייל" → highlight send).
  | {
      type: 'report_preview';
      rangeLabel: string;
      filtersLabel: string;
      // Optional — when present, the send-by-email button is enabled and
      // pre-filled with this address.
      recipientEmail?: string;
      // Body for the same-shape POSTs to /preview, /download, /send.
      query: { range: 'today' | 'tomorrow' | 'week' | 'custom'; date?: string; filters?: Record<string, boolean> };
      preferredAction?: 'download' | 'send';
    };

export interface ClarifyOption {
  label: string;
  text: string;
}

export type AssistantResponse =
  | { kind: 'answer'; blocks: Block[]; intent?: ParsedIntent }
  | { kind: 'clarify'; message: string; options?: ClarifyOption[]; intent?: ParsedIntent }
  | { kind: 'error'; message: string };

export type Range =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'week' }
  | { kind: 'date'; date: string };

export interface Filters {
  urgentOnly?: boolean;
  unpaidOnly?: boolean;
  deliveryOnly?: boolean;
  pickupOnly?: boolean;
}

export type UnknownHint = 'report' | 'orders' | 'stock' | 'petit_four' | 'package' | undefined;

// Short conversation memory carried by the client. Server is stateless —
// every POST /api/assistant/ask sends the latest snapshot and the parser uses
// it for follow-ups like "רק הדחופות" / "ותשלחי במייל" / "אותו דבר למחר".
//
// Lifetime: client-side React state, not stored in DB. Expired entries are
// dropped before the next request. 5-minute window (CONTEXT_TTL_MS).
// Entity resolver output — produced by src/lib/assistant/entity-resolver.ts
// when the user mentions a business object by name ("פיסטוק", "שוהם",
// "מארז 36", "טארטלט שוקולד"). Lets actions skip text-matching and work
// with a concrete (kind + id + canonical name) tuple.
export type ResolvedKind = 'פטיפור' | 'מוצר' | 'חומר_גלם' | 'מארז';

export interface ResolvedEntity {
  kind: ResolvedKind;
  id: string;
  canonicalName: string;
  // 0–1 confidence. 1.0 = full normalized name match. Used by callers to
  // decide whether to act directly or surface alternatives.
  matchScore: number;
}

export type ResolveQuality = 'exact' | 'prefix' | 'substring' | 'ambiguous' | 'none';

export interface ResolveResult {
  best: ResolvedEntity | null;
  alternatives: ResolvedEntity[]; // includes `best` when present, ordered by score desc
  quality: ResolveQuality;
}

export interface ConversationContext {
  lastIntent?: ParsedIntent;
  lastFilters?: Filters;
  lastRange?: Range;
  // Loose action label, lets follow-ups like "אותו דבר" / "גם לזה" reuse the
  // verb the user last performed (download / send / find / count / etc).
  lastAction?:
    | 'count' | 'find' | 'list' | 'stock_lookup'
    | 'report_download' | 'report_send' | 'report_choose';
  // The resolved entity from the previous turn — populated when an action
  // narrowed a name down to a concrete row. Future "תפתחי את זה" / "ומה אם
  // קוראים לזה אחרת" can then act on it without re-asking.
  lastEntity?: ResolvedEntity;
  lastResultIds?: string[];
}

// 5 minutes — a follow-up beyond this window is treated as a fresh query.
export const CONTEXT_TTL_MS = 5 * 60 * 1000;

// Scope for revenue queries — interpreted server-side against תאריך_אספקה.
//   today    — today only
//   week     — last 7 days through today
//   month    — current calendar month
//   pending  — outstanding (סטטוס_תשלום in ['ממתין', 'חלקי'])
export type RevenueScope = 'today' | 'week' | 'month' | 'pending';

// Scope for customer-activity queries.
//   month — last 30 days (default for "לקוחות הכי פעילים")
//   all   — lifetime
export type CustomerActivityScope = 'month' | 'all';

export type ParsedIntent =
  | { type: 'count_orders'; range: Range; filters: Filters }
  | { type: 'find_orders'; range: Range; filters: Filters }
  | { type: 'list_low_stock' }
  | { type: 'find_package'; query: string }
  | { type: 'stock_query'; query: string }
  | { type: 'list_petit_four_types' }
  | { type: 'order_petit_four_summary'; range: Range }
  | { type: 'count_order_items_by_kind'; range: Range; kind: 'מארז' | 'מוצר' }
  | { type: 'download_orders_report'; range: Range; filters: Filters }
  | { type: 'send_orders_report'; range: Range; filters: Filters; recipientEmail?: string }
  // User asked for a report but didn't say download or send. Action returns
  // a clarify with both options so the next round picks the path.
  | { type: 'request_report_action'; range: Range; filters: Filters }
  | { type: 'request_report_range' }
  // ── Additive intents (May 2026) — answer business-data questions ─────
  // Revenue / outstanding receivables.
  | { type: 'revenue_query'; scope: RevenueScope }
  // Top customers by order count + sum, optional scope.
  | { type: 'customers_top'; scope: CustomerActivityScope }
  // Look up a single customer by name fragment.
  | { type: 'customer_lookup'; query: string }
  // Active deliveries (status != 'נמסר').
  | { type: 'deliveries_open' }
  // Bundled snapshot — orders today + unpaid + low stock + active deliveries.
  | { type: 'daily_summary' }
  | { type: 'unknown'; hint?: UnknownHint };
