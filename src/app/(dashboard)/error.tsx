'use client';

import { useEffect } from 'react';

// Inside the dashboard segment so a crashing page keeps the NavBar (the root
// error.tsx replaces the whole layout). The technical message goes to the
// console only; the user gets plain Hebrew and a way back.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard] page error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-base font-semibold mb-2" style={{ color: '#2B1A10' }}>משהו השתבש בטעינת המסך</h2>
      <p className="text-sm mb-4" style={{ color: '#6B4A2D' }}>אפשר לנסות שוב, או לעבור למסך אחר מהתפריט.</p>
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
