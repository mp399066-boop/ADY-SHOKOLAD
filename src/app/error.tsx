'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-base font-semibold mb-2" style={{ color: '#2B1A10' }}>אירעה שגיאה</h2>
      <p className="text-sm mb-4" style={{ color: '#6B4A2D' }}>{error.message || 'שגיאה לא ידועה'}</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg text-sm text-white"
        style={{ backgroundColor: '#8B5E34' }}
      >
        נסה שוב
      </button>
    </div>
  );
}
