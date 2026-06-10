// ============================================================================
// System config (ברירות מחדל) — shared, client-safe registry.
//
// Pure data (no server imports) so both the client (useSystemConfig hook +
// /settings/defaults page) and the server (/api/admin/system-config) use the
// same key catalogue, defaults, and validation metadata.
//
// SAFE DEFAULTS ONLY. These are the initial values forms pre-fill with — never
// logic-driving enums, statuses, pricing rules, or CHECK-constrained values.
// `default` mirrors the value that USED to be hardcoded, and is the fallback
// the API/hook serve when the system_config table doesn't exist yet.
// ============================================================================

export type ConfigType = 'number' | 'option_ref';

export interface ConfigDef {
  key: string;
  /** Hebrew display label (admin UI). */
  label: string;
  /** Short Hebrew help text. */
  description?: string;
  type: ConfigType;
  /** Current hardcoded default (stored as text). */
  default: string;
  /** For option_ref: the OPTION_LISTS list_key whose active values are valid. */
  sourceList?: string;
  /** For option_ref: allow an empty selection ("none"). */
  allowEmpty?: boolean;
  /** For number: minimum allowed value (inclusive). */
  min?: number;
}

export const SYSTEM_CONFIG_DEFS: ConfigDef[] = [
  {
    key: 'default_payment_method',
    label: 'אמצעי תשלום ברירת מחדל',
    description: 'אמצעי התשלום שייבחר אוטומטית בהזמנה חדשה.',
    type: 'option_ref',
    sourceList: 'payment_methods',
    default: 'מזומן',
  },
  {
    key: 'default_order_source',
    label: 'מקור הזמנה ברירת מחדל',
    description: 'מקור ההזמנה שייבחר אוטומטית (אפשר להשאיר ריק).',
    type: 'option_ref',
    sourceList: 'order_sources',
    default: '',
    allowEmpty: true,
  },
  {
    key: 'default_customer_source',
    label: 'מקור הגעה ברירת מחדל (לקוח)',
    description: 'מקור ההגעה שייבחר אוטומטית בלקוח חדש (אפשר להשאיר ריק).',
    type: 'option_ref',
    sourceList: 'customer_sources',
    default: '',
    allowEmpty: true,
  },
  {
    key: 'default_delivery_fee',
    label: 'דמי משלוח ברירת מחדל (₪)',
    description: 'סכום דמי המשלוח שיוצג כברירת מחדל בהזמנה.',
    type: 'number',
    default: '0',
    min: 0,
  },
  {
    key: 'default_low_stock_threshold',
    label: 'סף מלאי נמוך ברירת מחדל',
    description: 'סף "מלאי נמוך" שיוצע לחומר גלם / פריט חדש.',
    type: 'number',
    default: '0',
    min: 0,
  },
  {
    key: 'default_critical_stock_threshold',
    label: 'סף מלאי קריטי ברירת מחדל',
    description: 'סף "מלאי קריטי" שיוצע לחומר גלם / פריט חדש (חייב להיות ≤ סף נמוך).',
    type: 'number',
    default: '0',
    min: 0,
  },
  {
    key: 'default_unit_of_measure',
    label: 'יחידת מידה ברירת מחדל',
    description: 'יחידת המידה שתיבחר אוטומטית לחומר גלם / רכיב חדש.',
    type: 'option_ref',
    sourceList: 'units_of_measure',
    default: 'ק"ג',
  },
];

export const SYSTEM_CONFIG_KEYS = SYSTEM_CONFIG_DEFS.map((d) => d.key);

export function getConfigDef(key: string): ConfigDef | undefined {
  return SYSTEM_CONFIG_DEFS.find((d) => d.key === key);
}

export function isValidConfigKey(key: string | null | undefined): boolean {
  return !!key && SYSTEM_CONFIG_KEYS.includes(key);
}

/** Full defaults map — used as the fallback before the migration is run. */
export function configDefaultsMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of SYSTEM_CONFIG_DEFS) out[d.key] = d.default;
  return out;
}

export interface ConfigValidationError {
  key: string;
  message: string;
}

/**
 * Validate an effective config map (current merged with the proposed patch).
 * Returns [] when valid. Shared by the API and the admin page so the rules
 * stay in one place.
 */
export function validateConfig(effective: Record<string, string>): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  for (const def of SYSTEM_CONFIG_DEFS) {
    const raw = effective[def.key] ?? '';
    if (def.type === 'number') {
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n)) {
        errors.push({ key: def.key, message: `${def.label}: יש להזין מספר תקין` });
      } else if (def.min !== undefined && n < def.min) {
        errors.push({ key: def.key, message: `${def.label}: לא יכול להיות קטן מ-${def.min}` });
      }
    } else if (def.type === 'option_ref') {
      if (!def.allowEmpty && !String(raw).trim()) {
        errors.push({ key: def.key, message: `${def.label}: חובה לבחור ערך` });
      }
    }
  }
  // Cross-field: critical stock threshold must be ≤ low stock threshold.
  const low = Number(effective['default_low_stock_threshold']);
  const crit = Number(effective['default_critical_stock_threshold']);
  if (Number.isFinite(low) && Number.isFinite(crit) && crit > low) {
    errors.push({
      key: 'default_critical_stock_threshold',
      message: 'סף קריטי חייב להיות קטן או שווה לסף נמוך',
    });
  }
  return errors;
}
