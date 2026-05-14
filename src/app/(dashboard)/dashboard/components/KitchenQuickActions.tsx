'use client';

import { useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const primaryActions: QuickAction[] = [
    { label: '+ הזמנה חדשה', icon: Plus, onClick: () => onNavigate('/orders/new'), primary: true },
    { label: 'ייצור לפי מתכון', icon: ClipboardList, onClick: onProduction, primary: true },
  ];
  const secondaryActions: QuickAction[] = [
    { label: '+ לקוח חדש', icon: UserPlus, onClick: () => onNavigate('/customers/new') },
    { label: '+ מוצר', icon: PackagePlus, onClick: () => onNavigate('/products') },
    { label: '+ חומר גלם', icon: FlaskConical, onClick: () => onNavigate('/inventory') },
    { label: '+ מתכון', icon: ScrollText, onClick: () => onNavigate('/recipes') },
    { label: 'פתח משלוחים', icon: Truck, onClick: () => onNavigate('/deliveries') },
    { label: 'דוח יומי', icon: FileText, onClick: () => onNavigate('/reports/orders') },
  ];

  return (
    <div className="relative flex flex-wrap items-center gap-2 pb-1">
      {primaryActions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="h-10 rounded-lg border px-3 text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
            style={{
              backgroundColor: action.primary ? C.espresso : C.card,
              color: action.primary ? '#FFFFFF' : C.text,
              borderColor: action.primary ? C.espresso : C.border,
              boxShadow: action.primary ? '0 8px 18px rgba(47, 27, 20, 0.10)' : 'none',
            }}
            title={action.label}
          >
            <Icon size={16} />
            <span>{action.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setOpen(curr => !curr)}
        className="h-10 rounded-lg border px-3 text-sm font-bold transition-colors"
        style={{ backgroundColor: C.card, color: C.textSoft, borderColor: C.border }}
      >
        עוד פעולות
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-20 w-56 rounded-lg border p-1.5 shadow-lg"
          style={{ backgroundColor: C.card, borderColor: C.border }}
        >
          {secondaryActions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-right text-sm font-semibold"
              style={{ color: C.text }}
              title={action.label}
            >
              <Icon size={15} color={C.cocoa} />
              <span>{action.label}</span>
            </button>
          );
          })}
        </div>
      )}
    </div>
  );
}
