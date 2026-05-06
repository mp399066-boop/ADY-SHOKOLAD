'use client';

import { Truck, Store } from 'lucide-react';

interface DeliveryTypeCardsProps {
  value: 'משלוח' | 'איסוף עצמי';
  onChange: (value: 'משלוח' | 'איסוף עצמי') => void;
}

const OPTIONS = [
  { key: 'משלוח'      as const, label: 'משלוח',       sub: 'שליחה לכתובת', Icon: Truck },
  { key: 'איסוף עצמי' as const, label: 'איסוף עצמי',  sub: 'הלקוח אוסף',    Icon: Store },
];

export function DeliveryTypeCards({ value, onChange }: DeliveryTypeCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {OPTIONS.map(({ key, label, sub, Icon }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-center gap-2.5 py-4 px-3 rounded-xl border-2 transition-all duration-150 text-center focus:outline-none"
            style={selected
              ? { borderColor: '#8B5E34', backgroundColor: '#FAF7F0', boxShadow: '0 2px 10px rgba(139,94,52,0.14)' }
              : { borderColor: '#E7D2A6', backgroundColor: '#FFFFFF' }}
            onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#C9A46A'; }}
            onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#E7D2A6'; }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: selected ? '#8B5E34' : '#F5ECD8' }}
            >
              <Icon size={20} color={selected ? '#FFFFFF' : '#8B5E34'} strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight" style={{ color: selected ? '#5C3410' : '#2B1A10' }}>
                {label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#9B7A5A' }}>
                {sub}
              </div>
            </div>
            {selected && (
              <span
                className="absolute"
                style={{ display: 'none' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
