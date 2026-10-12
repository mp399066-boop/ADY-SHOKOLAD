'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ShoppingBag, Users, Truck, Gift, Boxes, ChefHat, Factory, Calculator,
  Receipt, Wallet, UserCog, BarChart3, Upload, Settings, Search, Menu, X, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BusinessSettings } from '@/types/database';

interface NavItem { href: string; label: string; Icon: LucideIcon }

// Same order and names the team is used to.
const NAV_MAIN: NavItem[] = [
  { href: '/dashboard',  label: 'דשבורד',          Icon: LayoutDashboard },
  { href: '/orders',     label: 'הזמנות',          Icon: ShoppingBag },
  { href: '/customers',  label: 'לקוחות',          Icon: Users },
  { href: '/products',   label: 'מוצרים',          Icon: Gift },
  { href: '/deliveries', label: 'משלוחים',         Icon: Truck },
  { href: '/inventory',  label: 'מלאי',            Icon: Boxes },
  { href: '/recipes',    label: 'מתכונים',         Icon: ChefHat },
  { href: '/invoices',   label: 'חשבוניות וקבלות', Icon: Receipt },
  { href: '/finance',    label: 'פיננסים',         Icon: Wallet },
  { href: '/costs',      label: 'עלויות מוצרים',   Icon: Calculator },
  { href: '/suppliers',  label: 'ספקים',           Icon: Factory },
  { href: '/employees',  label: 'עובדים / משימות', Icon: UserCog },
];

const NAV_SYSTEM: NavItem[] = [
  { href: '/reports/orders', label: 'דוחות',  Icon: BarChart3 },
  { href: '/import',         label: 'ייבוא',  Icon: Upload },
  { href: '/settings',       label: 'הגדרות', Icon: Settings },
];

const ALL_NAV = [...NAV_MAIN, ...NAV_SYSTEM];

function openSearch() {
  window.dispatchEvent(new Event('global-search:open'));
}

export default function NavBar() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Via the API: business_settings has RLS with no browser policy.
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.data) setSettings(j.data as BusinessSettings); })
      .catch(() => {});
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const businessName = settings?.business_name || 'עדי תכשיט שוקולד';

  const desktopLink = ({ href, label }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex items-center whitespace-nowrap px-3 xl:px-3.5 text-[13.5px] transition-colors',
          active
            ? 'font-bold text-[#5C3A1E] bg-[#FBF3E8]'
            : 'font-medium text-[#6B4A2D] hover:text-[#2B1A10] hover:bg-[#FAF4EC]',
        )}
      >
        {label}
        {active && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-t-full bg-[#C9A46A]" aria-hidden />}
      </Link>
    );
  };

  return (
    <>
      <header className="no-print z-40 flex h-14 flex-shrink-0 items-center gap-3 border-b border-[#E8DED2] bg-white px-4 shadow-[0_1px_3px_rgba(58,42,26,0.06)]">
        {/* Brand */}
        <Link href="/dashboard" className="ml-3 flex flex-shrink-0 items-center gap-2.5">
          <img src={settings?.logo_url || '/logo.png'} alt={businessName} className="h-8 w-8 object-contain" />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[14.5px] font-bold text-[#3A2A1A]">{businessName}</span>
            <span className="text-[11px] tracking-wider text-[#9B7A5A]">Adi Chocolate Boutique</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden h-full flex-1 items-stretch overflow-x-auto md:flex" aria-label="ניווט ראשי">
          {NAV_MAIN.map(desktopLink)}
          <span className="mx-1 h-4 w-px flex-shrink-0 self-center bg-[#DDD0BC]" aria-hidden />
          {NAV_SYSTEM.map(desktopLink)}
        </nav>

        {/* Global search — desktop pill */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="חיפוש גלובלי"
          className="mx-2 hidden h-9 min-w-[180px] flex-shrink-0 items-center gap-2 rounded-[10px] border border-[#E8DED2] bg-[#FAF7F0] px-3 text-[13px] text-[#8A7664] hover:bg-[#F2EBDD] md:flex"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-right">חיפוש...</span>
          <kbd className="rounded border border-[#E8DED2] bg-white px-1.5 text-[11px] text-[#6B4A2D]">Ctrl K</kbd>
        </button>

        {/* Mobile: search + menu */}
        <div className="mr-auto flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={openSearch}
            aria-label="חיפוש"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6B4A2D] hover:bg-[#FAF4EC]"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? 'סגירת תפריט' : 'פתיחת תפריט'}
            aria-expanded={mobileOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6B4A2D] hover:bg-[#FAF4EC]"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 top-14 z-30 bg-[rgba(20,12,4,0.25)] md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-[#E8DED2] bg-white p-3 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {ALL_NAV.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[12.5px] transition-colors',
                      active ? 'bg-[#F5EBDD] font-semibold text-[#5C3A1E]' : 'text-[#6B4A2D] hover:bg-[#FAF7F0]',
                    )}
                  >
                    <Icon className={cn('h-5 w-5', active ? 'text-[#8B5E34]' : 'text-[#9B7A5A]')} />
                    <span className="text-center leading-tight">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
