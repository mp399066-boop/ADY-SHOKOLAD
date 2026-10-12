'use client';

import { cn } from '@/lib/utils';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={cn('flex overflow-x-auto border-b border-[#E8DED2]', className)} role="tablist">
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative -mb-px flex items-center whitespace-nowrap px-4 py-3 text-[13.5px] border-b-2 transition-colors',
              isActive
                ? 'border-[#C9A46A] font-semibold text-[#5C3A1E]'
                : 'border-transparent font-medium text-[#8A7664] hover:text-[#3A2A1A] hover:border-[#E8DED2]',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'mr-1.5 rounded-full px-1.5 py-0.5 text-[11.5px] tabular-nums',
                  isActive ? 'bg-[#F5EBDD] font-semibold text-[#8B5E34]' : 'bg-[#F0EAE0] text-[#8A7664]',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
