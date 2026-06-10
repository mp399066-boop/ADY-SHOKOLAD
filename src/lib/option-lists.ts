// ============================================================================
// Managed lists (רשימות ניהול) — shared, client-safe registry.
//
// This file is pure data (no server imports) so it can be used from both:
//   • client  — the useOptionList hook & the /settings/lists admin page
//   • server  — the /api/admin/option-lists routes (defaults + usage checks)
//
// `defaults` mirrors the values that USED to be hardcoded in the forms. They
// are seeded into system_option_lists (migration 049) as is_system rows and
// are also the fallback the API/hook serve if the table doesn't exist yet.
//
// IMPORTANT: only pure content lists belong here. Logic-driving enums
// (order/payment/delivery statuses, discount/product types, pricing tiers)
// are intentionally NOT managed — keep them hardcoded.
// ============================================================================

export interface OptionListUsage {
  /** Hebrew table name to scan for in-use values (delete protection). */
  table: string;
  /** Column on that table holding the value. */
  column: string;
}

export interface OptionListDef {
  key: string;
  /** Hebrew display name of the list (admin UI + tabs). */
  label: string;
  /** Short Hebrew description shown in the admin UI. */
  description: string;
  /** Current hardcoded values — seed + fallback. */
  defaults: string[];
  /** Tables/columns to check before allowing a hard delete. */
  usage: OptionListUsage[];
}

export const OPTION_LISTS: OptionListDef[] = [
  {
    key: 'product_categories',
    label: 'קטגוריות מוצר',
    description: 'קטגוריות לסיווג מוצרים (עוגה, פטיפורים וכו׳).',
    defaults: ['עוגה', 'פטיפורים', 'קינוחים', 'מארז', 'אחר'],
    usage: [{ table: 'מוצרים_למכירה', column: 'קטגוריית_מוצר' }],
  },
  {
    key: 'payment_methods',
    label: 'אמצעי תשלום',
    description: 'אמצעי התשלום שניתן לבחור בהזמנה.',
    defaults: ['מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'המחאה', 'אחר'],
    usage: [
      { table: 'הזמנות', column: 'אופן_תשלום' },
      { table: 'תשלומים', column: 'אמצעי_תשלום' },
    ],
  },
  {
    key: 'customer_sources',
    label: 'מקור הגעה (לקוח)',
    description: 'איך הלקוח הגיע אלינו (המלצה, רשת חברתית וכו׳).',
    defaults: ['המלצה', 'אינסטגרם', 'פייסבוק', 'WhatsApp', 'גוגל', 'אחר'],
    usage: [{ table: 'לקוחות', column: 'מקור_הגעה' }],
  },
  {
    key: 'order_sources',
    label: 'מקור הזמנה',
    description: 'דרך הקבלה של ההזמנה (טלפון, וואטסאפ, אתר וכו׳).',
    defaults: ['טלפון', 'WhatsApp', 'אינסטגרם', 'פייסבוק', 'אתר', 'הפניה', 'אחר'],
    usage: [{ table: 'הזמנות', column: 'מקור_ההזמנה' }],
  },
  {
    key: 'units_of_measure',
    label: 'יחידות מידה',
    description: 'יחידות מידה לחומרי גלם ומתכונים.',
    defaults: ['ק"ג', 'גרם', 'ליטר', 'מ"ל', 'יח׳', 'כף', 'כוס'],
    usage: [
      { table: 'מלאי_חומרי_גלם', column: 'יחידת_מידה' },
      { table: 'רכיבי_מתכון', column: 'יחידת_מידה' },
    ],
  },
  // ── Text presets (Phase 2) ────────────────────────────────────────────────
  // Content-only quick-pick snippets. They are NOT stored as enums on any
  // record, so there is no usage table and nothing to seed — they start empty
  // and the operator fills them in.
  {
    key: 'blessing_presets',
    label: 'ברכות מוכנות',
    description: 'נוסחי ברכה לבחירה מהירה (תוכן בלבד).',
    defaults: [],
    usage: [],
  },
  {
    key: 'order_note_presets',
    label: 'הערות הזמנה מוכנות',
    description: 'הערות נפוצות להזמנה לבחירה מהירה (תוכן בלבד).',
    defaults: [],
    usage: [],
  },
  {
    key: 'delivery_instruction_presets',
    label: 'הוראות משלוח מוכנות',
    description: 'הוראות משלוח נפוצות לבחירה מהירה (תוכן בלבד).',
    defaults: [],
    usage: [],
  },
];

export const OPTION_LIST_KEYS = OPTION_LISTS.map((l) => l.key);

export function getListDef(key: string): OptionListDef | undefined {
  return OPTION_LISTS.find((l) => l.key === key);
}

export function isValidListKey(key: string | null | undefined): boolean {
  return !!key && OPTION_LIST_KEYS.includes(key);
}

export function getDefaultValues(key: string): string[] {
  return getListDef(key)?.defaults ?? [];
}

/** Shape returned by the API / consumed by the admin page. */
export interface OptionListRow {
  id: string;
  list_key: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

/** Synthesize fallback rows from defaults (used before the migration is run). */
export function defaultRowsFor(key: string): OptionListRow[] {
  return getDefaultValues(key).map((value, i) => ({
    id: `default:${key}:${value}`,
    list_key: key,
    value,
    label: value,
    sort_order: i,
    is_active: true,
    is_system: true,
  }));
}
