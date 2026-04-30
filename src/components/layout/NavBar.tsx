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
        className="flex-shrink-0 flex items-center px-5 gap-3 z-40"
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #EAE0D4',
          boxShadow: '0 1px 0 rgba(0,0,0,0.03)',
          direction: 'rtl',
          height: '48px',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 flex-shrink-0" style={{ marginLeft: '16px' }}>
          {settings?.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.business_name || 'לוגו'}
              className="h-7 w-7 object-contain rounded-lg"
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: '#8B5E34', color: '#FEF8F0' }}
            >
              {(settings?.business_name || 'פ').charAt(0)}
            </div>
          )}
          <span className="text-sm font-medium hidden sm:block" style={{ color: '#3A2A1A', letterSpacing: '0.02em' }}>
            {settings?.business_name || 'עדי תכשיט שוקולד'}
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-stretch flex-1 gap-0.5 overflow-x-auto h-full px-1">
          {NAV_MAIN.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3.5 text-xs transition-all duration-150 whitespace-nowrap relative rounded-sm my-2"
                style={active
                  ? {
                      color: '#6B3E1A',
                      fontWeight: 600,
                      backgroundColor: '#F5EAD8',
                      borderBottom: '2px solid #C9A46A',
                      borderRadius: '6px 6px 0 0',
                      marginBottom: '-1px',
                      paddingBottom: 'calc(0.5rem + 1px)',
                    }
                  : { color: '#7A6654', fontWeight: 400 }
                }
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#3A2A1A';
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#FAF4EC';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#7A6654';
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <Icon className="w-3 h-3 flex-shrink-0 opacity-70" />
                <span>{label}</span>
              </Link>
            );
          })}

          <span className="w-px self-center h-4 mx-2 flex-shrink-0" style={{ backgroundColor: '#E0D4C4' }} />

          {NAV_SYSTEM.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3.5 text-xs transition-all duration-150 whitespace-nowrap relative rounded-sm my-2"
                style={active
                  ? {
                      color: '#6B3E1A',
                      fontWeight: 600,
                      backgroundColor: '#F5EAD8',
                      borderBottom: '2px solid #C9A46A',
                      borderRadius: '6px 6px 0 0',
                      marginBottom: '-1px',
                      paddingBottom: 'calc(0.5rem + 1px)',
                    }
                  : { color: '#7A6654', fontWeight: 400 }
                }
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#3A2A1A';
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#FAF4EC';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#7A6654';
                    (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <Icon className="w-3 h-3 flex-shrink-0 opacity-70" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-1.5 rounded-lg transition-colors ml-auto"
          style={{ color: '#8A7664' }}
          onClick={() => setMobileOpen(o => !o)}
        >
          {mobileOpen ? <IconX className="w-4 h-4" /> : <IconMenu className="w-4 h-4" />}
        </button>
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30"
          style={{ paddingTop: '48px', backgroundColor: 'rgba(0,0,0,0.18)' }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="bg-white p-3 shadow-lg"
            style={{ borderBottom: '1px solid #EAE0D4', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-1.5">
              {ALL_NAV.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs transition-colors"
                  style={isActive(href)
                    ? { backgroundColor: '#FBF5EC', color: '#8B5E34', fontWeight: 500 }
                    : { color: '#8A7664' }
                  }
                >
                  <Icon className="w-4 h-4" />
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
