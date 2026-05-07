// ─── Brand palette ────────────────────────────────────────────────────────────

export const BRAND = {
  bg:            '#F8F6F2',   // page background
  card:          '#FFFFFF',   // card surface
  border:        '#E8DED2',   // default border
  borderLight:   '#F0EAE0',   // subtle dividers

  textPrimary:   '#3A2A1A',   // main body text
  textSecondary: '#8A7664',   // muted labels
  textMuted:     '#B0A090',   // placeholders / disabled

  primary:       '#8B5E34',   // CTA brown
  gold:          '#C9A46A',   // accent gold
  goldLight:     '#EDD9B4',   // gold tint

  success:       '#2D6648',
  warning:       '#7A5820',
  danger:        '#8A3228',
  info:          '#2A4E6B',
} as const;

// ─── Legacy alias (used internally) ─────────────────────────────────────────

export const BRAND_COLORS = {
  primary:       BRAND.primary,
  secondary:     BRAND.gold,
  lightGold:     BRAND.goldLight,
  darkBrown:     '#5C3A1E',
  cream:         BRAND.bg,
  card:          BRAND.card,
  textPrimary:   BRAND.textPrimary,
  textSecondary: BRAND.textSecondary,
  border:        BRAND.border,
  success:       BRAND.success,
  warning:       '#B45309',
  danger:        BRAND.danger,
  info:          BRAND.info,
} as const;

// ─── Status color shapes ─────────────────────────────────────────────────────
// All colors use muted, warm tones — no saturated blues or loud greens.

interface StatusColor { bg: string; text: string; border: string }

export const STATUS_COLORS: Record<string, StatusColor> = {
  חדשה:               { bg: '#F5F1EB', text: '#6B4B32', border: '#E0D4C2' },
  בהכנה:              { bg: '#FBF5E6', text: '#7A5820', border: '#EDCF98' },
  'מוכנה למשלוח':     { bg: '#EAF0E7', text: '#33623A', border: '#BDD5C0' },
  נשלחה:              { bg: '#EEF0F4', text: '#3E4E6A', border: '#C8D2E2' },
  'הושלמה בהצלחה':    { bg: '#E4EEE8', text: '#2A5C38', border: '#B4D2BE' },
  בוטלה:              { bg: '#F0EAE8', text: '#8A3228', border: '#D8BCB6' },
  טיוטה:              { bg: '#F5F0FA', text: '#5B21B6', border: '#DDD6FE' },
};

export const PAYMENT_STATUS_COLORS: Record<string, StatusColor> = {
  ממתין: { bg: '#FBF5E6', text: '#7A5820', border: '#EDCF98' },
  שולם:  { bg: '#E4EEE8', text: '#2A5C38', border: '#B4D2BE' },
  חלקי:  { bg: '#FBF0E4', text: '#7A4820', border: '#EDC898' },
  בוטל:  { bg: '#F0EAE8', text: '#8A3228', border: '#D8BCB6' },
};

export const INVENTORY_STATUS_COLORS: Record<string, StatusColor> = {
  תקין:          { bg: '#E4EEE8', text: '#2A5C38', border: '#B4D2BE' },
  'מלאי נמוך':   { bg: '#FBF5E6', text: '#7A5820', border: '#EDCF98' },
  קריטי:         { bg: '#FBF0E4', text: '#7A4820', border: '#EDC898' },
  'אזל מהמלאי':  { bg: '#F0EAE8', text: '#8A3228', border: '#D8BCB6' },
};

export const DELIVERY_STATUS_COLORS: Record<string, StatusColor> = {
  נאסף: { bg: '#FBF5E6', text: '#7A5820', border: '#EDCF98' },
  נמסר: { bg: '#E4EEE8', text: '#2A5C38', border: '#B4D2BE' },
};

export const CUSTOMER_TYPE_COLORS: Record<string, StatusColor> = {
  פרטי:  { bg: '#F5F1EB', text: '#6B4B32', border: '#E0D4C2' },
  חוזר:  { bg: '#EAF0F5', text: '#2A4C6A', border: '#B6CCDD' },
  עסקי:  { bg: '#EEEAF4', text: '#4A3868', border: '#CCC4D8' },
};
