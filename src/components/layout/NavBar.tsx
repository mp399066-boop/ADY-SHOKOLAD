'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  IconDashboard, IconOrders, IconCustomers, IconProducts,
  IconDeliveries, IconInventory, IconRecipes, IconInvoices,
  IconImport, IconSettings, IconMenu, IconX,
} from '@/components/icons';
import type { BusinessSettings } from '@/types/database';

const NAV_MAIN = [
  { href: '/dashboard',  label: 'לוח בקרה',   Icon: IconDashboard  },
  { href: '/orders',     label: 'הזמנות',       Icon: IconOrders     },
  { href: '/customers',  label: 'לקוחות',       Icon: IconCustomers  },
  { href: '/products',   label: 'מוצרים',       Icon: IconProducts   },
  { href: '/deliveries', label: 'משלוחים',      Icon: IconDeliveries },
  { href: '/inventory',  label: 'מלאי',         Icon: IconInventory  },
  { href: '/recipes',    label: 'מתכונים',      Icon: IconRecipes    },
  { href: '/invoices',   label: 'חשבוניות',     Icon: IconInvoices   },
];

const NAV_SYSTEM = [
  { href: '/import',   label: 'ייבוא',   Icon: IconImport   },
  { href: '/settings', label: 'הגדרות',  Icon: IconSettings },
];

const ALL_NAV = [...NAV_MAIN, ...NAV_SYSTEM];

export default function NavBar() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('business_settings').select('*').single()
      .then(({ data }: { data: any }) => { if (data) setSettings(data as BusinessSettings); });
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <>
      <header
        className="flex-shrink-0 flex items-center px-4 gap-3 z-40"
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E7E1D8',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          direction: 'rtl',
          minHeight: '54px',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0" style={{ marginLeft: '12px' }}>
          {settings?.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.business_name || 'לוגו'}
              className="h-9 w-9 object-contain rounded-xl"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: '#8B5E3C', color: '#FEFAF5' }}
            >
              {(settings?.business_name || 'פ').charAt(0)}
            </div>
          )}
          <span className="text-sm font-semibold hidden sm:block" style={{ color: '#2B2B2B' }}>
            {settings?.business_name || 'עדי תכשיט שוקולד'}
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center flex-1 gap-0.5 overflow-x-auto">
          {NAV_MAIN.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 whitespace-nowrap"
              style={isActive(href)
                ? { backgroundColor: '#F2EBE1', color: '#8B5E3C', fontWeight: 600 }
                : { color: '#5C5C5C' }
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
          <span className="w-px h-5 mx-1 flex-shrink-0" style={{ backgroundColor: '#E7E1D8' }} />
          {NAV_SYSTEM.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 whitespace-nowrap"
              style={isActive(href)
                ? { backgroundColor: '#F2EBE1', color: '#8B5E3C', fontWeight: 600 }
                : { color: '#5C5C5C' }
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-1.5 rounded-lg transition-colors ml-auto"
          style={{ color: '#5C3A1E' }}
          onClick={() => setMobileOpen(o => !o)}
        >
          {mobileOpen ? <IconX className="w-5 h-5" /> : <IconMenu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile dropdown overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30"
          style={{ paddingTop: '52px', backgroundColor: 'rgba(0,0,0,0.25)' }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="bg-white p-4 shadow-xl"
            style={{ borderBottom: '1px solid #E7E1D8', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-2">
              {ALL_NAV.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl text-xs transition-colors"
                  style={isActive(href)
                    ? { backgroundColor: '#F2EBE1', color: '#8B5E3C', fontWeight: 500 }
                    : { color: '#5C5C5C' }
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-center leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
