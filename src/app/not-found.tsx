import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: '#FAF7F0' }}>
      <div className="text-center space-y-4">
        <div className="text-6xl font-bold" style={{ color: '#E7D2A6' }}>404</div>
        <h1 className="text-xl font-semibold" style={{ color: '#2B1A10' }}>הדף לא נמצא</h1>
        <p className="text-sm" style={{ color: '#6B4A2D' }}>הדף שחיפשת אינו קיים</p>
        <Link href="/dashboard">
          <button className="px-4 py-2 rounded-lg text-sm text-white" style={{ backgroundColor: '#8B5E34' }}>
            חזרה ללוח הבקרה
          </button>
        </Link>
      </div>
    </div>
  );
}
