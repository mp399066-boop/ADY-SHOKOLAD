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
  | { type: 'confirm_send_report'; recipientEmail: string; rangeLabel: string; filtersLabel: string; payload: Record<string, unknown> };

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
  | { type: 'unknown'; hint?: UnknownHint };
