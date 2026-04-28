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
    <div className={`flex border-b ${className}`} style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative px-5 py-3 text-sm transition-all duration-200 whitespace-nowrap"
            style={
              isActive
                ? { color: '#8B5E34', fontWeight: 500, borderBottom: '2px solid #C7A46B', marginBottom: '-1px' }
                : { color: '#9B8472', fontWeight: 400 }
            }
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="mr-2 px-1.5 py-0.5 rounded-full text-xs"
                style={
                  isActive
                    ? { backgroundColor: '#F0E6D6', color: '#8B5E34', fontWeight: 600 }
                    : { backgroundColor: 'rgba(0,0,0,0.05)', color: '#9B8472' }
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
