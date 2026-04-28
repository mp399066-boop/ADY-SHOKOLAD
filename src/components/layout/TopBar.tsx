'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconMenu, IconPlus } from '@/components/icons';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':  'לוח בקרה',
  '/orders':     'הזמנות',
  '/orders/new': 'הזמנה חדשה',
  '/customers':  'לקוחות',
  '/products':   'מוצרים',
  '/deliveries': 'משלוחים',
  '/inventory':  'מלאי',
  '/recipes':    'מתכונים וייצור',
  '/invoices':   'חשבוניות',
  '/import':     'ייבוא נתונים',
  '/settings':   'הגדרות',
};

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const pathname = usePathname();
  const title =
    PAGE_TITLES[pathname] ||
    PAGE_TITLES[
      Object.keys(PAGE_TITLES).find(
        k => pathname.startsWith(k) && k !== '/',
      ) || ''
    ] ||
    'מערכת ניהול';

  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header
      className="flex items-center gap-4 px-6 py-3 border-b flex-shrink-0"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#EDE0CE', minHeight: '60px' }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
        style={{ color: '#6B4A2D' }}
      >
        <IconMenu className="w-5 h-5" />
      </button>

      {/* Title */}
      <h1 className="text-lg font-bold flex-1" style={{ color: '#2B1A10' }}>
        {title}
      </h1>

      {/* Date */}
      <span className="hidden sm:block text-xs" style={{ color: '#9B7A5A' }}>
        {dateStr}
      </span>

      {/* Quick new order */}
      <Link href="/orders/new">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
        >
          <IconPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">הזמנה חדשה</span>
        </button>
      </Link>
    </header>
  );
}
