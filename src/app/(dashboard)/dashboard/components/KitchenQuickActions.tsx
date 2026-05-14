'use client';

import { ClipboardList, FileText, FlaskConical, PackagePlus, Plus, ScrollText, Truck, UserPlus, type LucideIcon } from 'lucide-react';
import { C } from './theme';

type QuickAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  primary?: boolean;
};

export function KitchenQuickActions({
  onNavigate,
  onProduction,
}: {
  onNavigate: (path: string) => void;
  onProduction: () => void;
}) {
  const actions: QuickAction[] = [
    { label: '+ הזמנה חדשה', icon: Plus, onClick: () => onNavigate('/orders/new'), primary: true },
    { label: '+ לקוח חדש', icon: UserPlus, onClick: () => onNavigate('/customers/new') },
    { label: '+ מוצר', icon: PackagePlus, onClick: () => onNavigate('/products') },
    { label: '+ חומר גלם', icon: FlaskConical, onClick: () => onNavigate('/inventory') },
    { label: '+ מתכון', icon: ScrollText, onClick: () => onNavigate('/recipes') },
    { label: 'ייצור לפי מתכון', icon: ClipboardList, onClick: onProduction, primary: true },
    { label: 'פתח משלוחים', icon: Truck, onClick: () => onNavigate('/deliveries') },
    { label: 'דוח יומי', icon: FileText, onClick: () => onNavigate('/reports/orders') },
  ];

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="h-11 rounded-lg border px-3 text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
              style={{
                backgroundColor: action.primary ? C.espresso : C.card,
                color: action.primary ? '#FFFFFF' : C.text,
                borderColor: action.primary ? C.espresso : C.border,
              }}
              title={action.label}
            >
              <Icon size={17} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
