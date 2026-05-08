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
  | { type: 'stat'; label: string; value: string; sublabel?: string; tone?: Tone; emoji?: string }
  | { type: 'list'; title?: string; items: ListItem[] }
  | { type: 'orders'; title?: string; orders: OrderSummary[] };

export interface ClarifyOption {
  label: string;
  text: string;
}

export type AssistantResponse =
  | { kind: 'answer'; blocks: Block[] }
  | { kind: 'clarify'; message: string; options?: ClarifyOption[] }
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

export type ParsedIntent =
  | { type: 'count_orders'; range: Range; filters: Filters }
  | { type: 'find_orders'; range: Range; filters: Filters }
  | { type: 'list_low_stock' }
  | { type: 'find_package'; query: string }
  | { type: 'stock_query'; query: string }
  | { type: 'unknown' };
