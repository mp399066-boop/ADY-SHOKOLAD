export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-9 w-9' };
  return (
    <div className="flex items-center justify-center">
      <svg
        className={`animate-spin ${sizes[size]}`}
        fill="none"
        viewBox="0 0 24 24"
        style={{ color: '#C6A77D' }}
      >
        <circle
          className="opacity-20"
          cx="12" cy="12" r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-70"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <LoadingSpinner size="lg" />
        <p className="text-xs" style={{ color: '#7A7A7A', letterSpacing: '0.02em' }}>טוען נתונים...</p>
      </div>
    </div>
  );
}
