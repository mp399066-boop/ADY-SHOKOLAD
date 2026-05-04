'use client';

interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'danger';
  onClick: () => void;
}

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}

export function BulkActionBar({ count, onClear, actions }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E8DDD0',
        boxShadow: '0 8px 32px rgba(58,42,26,0.13), 0 2px 8px rgba(58,42,26,0.06)',
        direction: 'rtl',
        whiteSpace: 'nowrap',
      }}
    >
      <span className="text-xs font-medium" style={{ color: '#8B5E34' }}>
        נבחרו{' '}
        <span className="font-bold" style={{ color: '#2B1A10' }}>
          {count}
        </span>
      </span>

      <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: '#DDD0BC' }} />

      <div className="flex items-center gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={
              action.variant === 'danger'
                ? { backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
                : { backgroundColor: '#FAF7F2', color: '#6B4A2D', border: '1px solid #DDD0BC' }
            }
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                action.variant === 'danger' ? '#FEE2E2' : '#F0E8DC';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                action.variant === 'danger' ? '#FEF2F2' : '#FAF7F2';
            }}
          >
            {action.icon && <span className="opacity-80">{action.icon}</span>}
            {action.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: '#DDD0BC' }} />

      <button
        onClick={onClear}
        className="text-xs transition-colors px-1"
        style={{ color: '#B0A090' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B4A2D'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#B0A090'; }}
      >
        ביטול
      </button>
    </div>
  );
}
