'use client';

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
    <div className={`flex border-b ${className}`} style={{ borderColor: '#E2D4C0' }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
            style={
              isActive
                ? { color: '#8B5E34', borderBottom: '2px solid #8B5E34', marginBottom: '-1px' }
                : { color: '#6B4A2D' }
            }
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="mr-2 px-1.5 py-0.5 rounded-full text-xs font-semibold"
                style={
                  isActive
                    ? { backgroundColor: '#8B5E34', color: '#FFFFFF' }
                    : { backgroundColor: '#EDE0CE', color: '#6B4A2D' }
                }
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
