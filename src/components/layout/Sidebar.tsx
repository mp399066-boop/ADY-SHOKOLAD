'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  IconDashboard, IconOrders, IconCustomers, IconProducts,
  IconDeliveries, IconInventory, IconRecipes, IconInvoices,
  IconImport, IconSettings, IconX,
} from '@/components/icons';
import type { BusinessSettings } from '@/types/database';

const NAV_MAIN = [
  { href: '/dashboard',  label: 'לוח בקרה',         Icon: IconDashboard  },
  { href: '/orders',     label: 'הזמנות',             Icon: IconOrders     },
  { href: '/customers',  label: 'לקוחות',             Icon: IconCustomers  },
  { href: '/products',   label: 'מוצרים',             Icon: IconProducts   },
  { href: '/deliveries', label: 'משלוחים',            Icon: IconDeliveries },
  { href: '/inventory',  label: 'מלאי',               Icon: IconInventory  },
  { href: '/recipes',    label: 'מתכונים וייצור',     Icon: IconRecipes    },
  { href: '/invoices',   label: 'חשבוניות',           Icon: IconInvoices   },
];

const NAV_SYSTEM = [
  { href: '/import',    label: 'ייבוא נתונים', Icon: IconImport   },
  { href: '/settings',  label: 'הגדרות',       Icon: IconSettings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('business_settings')
      .select('*')
      .single()
      .then(({ data }: { data: any }) => {
        if (data) setSettings(data as BusinessSettings);
      });
  }, []);

  function NavItem({ href, label, Icon }: { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }) {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link
        href={href}
        onClick={() => onClose?.()}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
          isActive ? '' : 'hover:bg-white/8',
        )}
        style={isActive ? { backgroundColor: '#8B5E34', color: '#FAF7F0' } : { color: '#C4A882' }}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <>
      {onClose && open && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'flex flex-col w-64 min-h-screen shadow-xl z-40 transition-transform duration-300',
          'fixed md:relative top-0 bottom-0',
          open ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
        )}
        style={{ backgroundColor: '#2D1B0E', direction: 'rtl' }}
      >
        {/* Brand */}
        <div
          className="flex items-center justify-between px-5 py-5 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.business_name || 'לוגו'}
                className="h-9 w-9 max-w-[36px] object-contain rounded-lg flex-shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{ backgroundColor: '#8B5E34', color: '#FAF7F0' }}
              >
                {(settings?.business_name || 'פ').charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: '#FAF7F0' }}>
                {settings?.business_name || 'עדי תכשיט שוקולד'}
              </div>
              <div className="text-xs" style={{ color: '#A0846A' }}>מערכת ניהול</div>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
              style={{ color: '#A0846A' }}
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* CTA button */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <Link href="/orders/new" onClick={() => onClose?.()}>
            <div
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110 shadow-sm"
              style={{ backgroundColor: '#8B5E34', color: '#FAF7F0' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              הזמנה חדשה
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {/* Main section */}
          <div>
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B4A2D' }}>
              ניווט
            </p>
            <div className="space-y-0.5">
              {NAV_MAIN.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>

          {/* System section */}
          <div>
            <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B4A2D' }}>
              מערכת
            </p>
            <div className="space-y-0.5">
              {NAV_SYSTEM.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div
          className="px-5 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs text-center" style={{ color: '#6B4A2D' }}>
            © {new Date().getFullYear()} עדי תכשיט שוקולד
          </p>
        </div>
      </aside>
    </>
  );
}
