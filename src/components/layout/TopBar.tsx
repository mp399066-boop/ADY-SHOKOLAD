'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconMenu, IconPlus } from '@/components/icons';
import type { BusinessSettings } from '@/types/database';

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
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('business_settings').select('*').single()
      .then(({ data }: { data: any }) => { if (data) setSettings(data as BusinessSettings); });
  }, []);
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
      className="flex items-center gap-4 px-6 py-3 flex-shrink-0"
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #EDE8E0',
        minHeight: '56px',
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-1.5 rounded-lg transition-colors"
        style={{ color: '#8B6A50' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F6F0E8')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <IconMenu className="w-5 h-5" />
      </button>

      {/* Logo */}
      {settings?.logo_url ? (
        <img
          src={settings.logo_url}
          alt={settings.business_name || 'לוגו'}
          className="h-8 w-8 object-contain rounded-lg flex-shrink-0 hidden sm:block"
        />
      ) : null}

      {/* Title */}
      <h1 className="text-base font-semibold flex-1" style={{ color: '#1C1008' }}>
        {title}
      </h1>

      {/* Date */}
      <span className="hidden sm:block text-xs" style={{ color: '#A89278' }}>
        {dateStr}
      </span>

      {/* Quick new order */}
      <Link href="/orders/new">
        <button
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all"
          style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <IconPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">הזמנה חדשה</span>
        </button>
      </Link>
    </header>
  );
}
