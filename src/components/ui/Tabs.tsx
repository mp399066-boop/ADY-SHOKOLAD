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
    <div className={`flex border-b ${className}`} style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative px-5 py-3 text-sm transition-all duration-200 whitespace-nowrap"
            style={
              isActive
                ? { color: '#7C5230', fontWeight: 600, borderBottom: '2px solid #B8955A', marginBottom: '-1px' }
                : { color: '#7A5840', fontWeight: 400 }
            }
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="mr-2 px-1.5 py-0.5 rounded-full text-xs"
                style={
                  isActive
                    ? { backgroundColor: '#EDD9BE', color: '#7C5230', fontWeight: 600 }
                    : { backgroundColor: 'rgba(0,0,0,0.07)', color: '#7A5840' }
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
