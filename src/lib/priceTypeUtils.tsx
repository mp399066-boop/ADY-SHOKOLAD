export const PRICE_TYPE_LABELS: Record<string, string> = {
  retail:            'לקוח פרטי',
  retail_quantity:   'לקוח פרטי אירוע - כמות',
  business_fixed:    'עסקי קבוע',
  business_quantity: 'עסקי אירוע - כמות',
};

export const PRICE_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  retail:            { bg: '#EFE4D3', color: '#5C3410' },
  retail_quantity:   { bg: '#FFF3CD', color: '#7C5A1E' },
  business_fixed:    { bg: '#D6EAF8', color: '#1A4D6E' },
  business_quantity: { bg: '#D5F0E3', color: '#1D6A3D' },
};

export function PriceTypeBadge({ type }: { type: string | null | undefined }) {
  const label = PRICE_TYPE_LABELS[type ?? ''] ?? type ?? '—';
  const style = PRICE_TYPE_COLORS[type ?? ''] ?? { bg: '#F3F4F6', color: '#374151' };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {label}
    </span>
  );
}
