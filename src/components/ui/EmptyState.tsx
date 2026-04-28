interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor: '#F5EDE3' }}
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.4} style={{ color: '#C7A46B' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium mb-1.5" style={{ color: '#4A3525', letterSpacing: '0.2px' }}>
        {title}
      </h3>
      {description && (
        <p className="text-xs mb-5 max-w-xs leading-relaxed" style={{ color: '#A08870' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
