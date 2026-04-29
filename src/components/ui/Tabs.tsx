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
    <div className={`flex border-b ${className}`} style={{ borderColor: '#E7E1D8' }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative px-5 py-3 text-sm transition-all duration-200 whitespace-nowrap"
            style={
              isActive
                ? { color: '#8B5E3C', fontWeight: 600, borderBottom: '2px solid #C6A77D', marginBottom: '-1px' }
                : { color: '#7A7A7A', fontWeight: 400 }
            }
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="mr-2 px-1.5 py-0.5 rounded-full text-xs"
                style={
                  isActive
                    ? { backgroundColor: '#F2EBE1', color: '#8B5E3C', fontWeight: 600 }
                    : { backgroundColor: '#F0EEE9', color: '#7A7A7A' }
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
