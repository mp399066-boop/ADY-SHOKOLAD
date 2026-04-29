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
    <div className={`flex border-b ${className}`} style={{ borderColor: '#EAE0D4' }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative px-4 py-2.5 text-xs transition-all duration-150 whitespace-nowrap"
            style={
              isActive
                ? { color: '#8B5E34', fontWeight: 500, borderBottom: '2px solid #C9A46A', marginBottom: '-1px' }
                : { color: '#8A7664', fontWeight: 400 }
            }
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className="mr-1.5 px-1.5 py-0.5 rounded-full text-xs"
                style={
                  isActive
                    ? { backgroundColor: '#F5EFE5', color: '#8B5E34', fontWeight: 500 }
                    : { backgroundColor: '#F0EAE2', color: '#8A7664' }
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
