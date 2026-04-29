import {
  STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
  INVENTORY_STATUS_COLORS,
  DELIVERY_STATUS_COLORS,
  CUSTOMER_TYPE_COLORS,
} from '@/constants/theme';

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'payment' | 'inventory' | 'delivery' | 'customer';
}

const FALLBACK = { bg: '#F5F1EB', text: '#8A7664', border: '#E0D4C2' };

export function StatusBadge({ status, type = 'order' }: StatusBadgeProps) {
  const colorMaps = {
    order:     STATUS_COLORS,
    payment:   PAYMENT_STATUS_COLORS,
    inventory: INVENTORY_STATUS_COLORS,
    delivery:  DELIVERY_STATUS_COLORS,
    customer:  CUSTOMER_TYPE_COLORS,
  };

  const c = colorMaps[type][status] ?? FALLBACK;

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {status}
    </span>
  );
}

export function UrgentBadge() {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: '#F0EAE8', color: '#8A3228', border: '1px solid #D8BCB6' }}
    >
      דחוף
    </span>
  );
}
