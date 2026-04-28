import {
  STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
  INVENTORY_STATUS_COLORS,
  DELIVERY_STATUS_COLORS,
  CUSTOMER_TYPE_COLORS,
} from '@/constants/theme';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'payment' | 'inventory' | 'delivery' | 'customer';
}

export function StatusBadge({ status, type = 'order' }: StatusBadgeProps) {
  const colorMaps = {
    order: STATUS_COLORS,
    payment: PAYMENT_STATUS_COLORS,
    inventory: INVENTORY_STATUS_COLORS,
    delivery: DELIVERY_STATUS_COLORS,
    customer: CUSTOMER_TYPE_COLORS,
  };

  const colors = colorMaps[type][status] || 'bg-stone-100 text-stone-600';

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        colors
      )}
    >
      {status}
    </span>
  );
}

export function UrgentBadge() {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
      דחוף
    </span>
  );
}
