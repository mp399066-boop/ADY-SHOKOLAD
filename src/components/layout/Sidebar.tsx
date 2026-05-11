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
  { href: '/dashboard',  label: 'דשבורד',         Icon: IconDashboard  },
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
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
          isActive
            ? 'font-medium'
            : 'font-normal hover:bg-white/8',
        )}
        style={
          isActive
            ? {
                backgroundColor: 'rgba(199, 164, 107, 0.18)',
                color: '#FAF7F0',
                boxShadow: 'inset 3px 0 0 #C7A46B',
              }
            : { color: '#A88B6A' }
        }
      >
        <Icon className="w-4 h-4 flex-shrink-0 opacity-90" />
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <>
      {onClose && open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'flex flex-col w-60 min-h-screen z-40 transition-transform duration-300',
          'fixed md:relative top-0 bottom-0',
          open ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
        )}
        style={{ backgroundColor: '#2A1A0E', direction: 'rtl', borderLeft: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* Brand */}
        <div
          className="flex items-center justify-between px-4 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={settings?.logo_url || '/logo.png'}
              alt={settings?.business_name || 'עדי תכשיט שוקולד'}
              className="h-9 w-9 max-w-[36px] object-contain flex-shrink-0"
              style={{ filter: 'brightness(1.15)' }}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: '#F0E8DC' }}>
                {settings?.business_name || 'עדי תכשיט שוקולד'}
              </div>
              <div className="text-xs" style={{ color: '#7A5C40' }}>מערכת ניהול</div>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
              style={{ color: '#7A5C40' }}
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {/* Main */}
          <div className="mb-4">
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(168,139,106,0.5)' }}>
              ניווט
            </p>
            <div className="space-y-0.5">
              {NAV_MAIN.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>

          {/* System */}
          <div>
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(168,139,106,0.5)' }}>
              מערכת
            </p>
            <div className="space-y-0.5">
              {NAV_SYSTEM.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div
          className="px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs text-center" style={{ color: 'rgba(168,139,106,0.45)' }}>
            © {new Date().getFullYear()} עדי תכשיט שוקולד
          </p>
        </div>
      </aside>
    </>
  );
}
