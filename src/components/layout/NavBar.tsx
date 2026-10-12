'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, ShoppingBag, Users, Truck, Gift, Boxes, ChefHat, Factory, Calculator,
  Receipt, Wallet, UserCog, BarChart3, Upload, Settings, Search, Menu, X, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BusinessSettings } from '@/types/database';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Shown inline only on wide screens (xl+); below that it lives under "עוד". */
  secondary?: boolean;
}

// Same order and names the team is used to.
const NAV_MAIN: NavItem[] = [
  { href: '/dashboard',  label: 'דשבורד',          Icon: LayoutDashboard },
  { href: '/orders',     label: 'הזמנות',          Icon: ShoppingBag },
  { href: '/customers',  label: 'לקוחות',          Icon: Users },
  { href: '/products',   label: 'מוצרים',          Icon: Gift },
  { href: '/deliveries', label: 'משלוחים',         Icon: Truck },
  { href: '/inventory',  label: 'מלאי',            Icon: Boxes },
  { href: '/recipes',    label: 'מתכונים',         Icon: ChefHat,    secondary: true },
  { href: '/invoices',   label: 'חשבוניות וקבלות', Icon: Receipt },
  { href: '/finance',    label: 'פיננסים',         Icon: Wallet },
  { href: '/costs',      label: 'עלויות מוצרים',   Icon: Calculator, secondary: true },
  { href: '/suppliers',  label: 'ספקים',           Icon: Factory,    secondary: true },
  { href: '/employees',  label: 'עובדים / משימות', Icon: UserCog,    secondary: true },
];

const NAV_SYSTEM: NavItem[] = [
  { href: '/reports/orders', label: 'דוחות',  Icon: BarChart3 },
  { href: '/import',         label: 'ייבוא',  Icon: Upload },
  { href: '/settings',       label: 'הגדרות', Icon: Settings },
];

const ALL_NAV = [...NAV_MAIN, ...NAV_SYSTEM];
const SECONDARY = NAV_MAIN.filter(i => i.secondary);

function openSearch() {
  window.dispatchEvent(new Event('global-search:open'));
}

export default function NavBar() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Via the API: business_settings has RLS with no browser policy.
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.data) setSettings(j.data as BusinessSettings); })
      .catch(() => {});
  }, []);

  // Close menus whenever the route changes.
  useEffect(() => { setMobileOpen(false); setMoreOpen(false); }, [pathname]);

  // "עוד" closes on outside click / Esc.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const businessName = settings?.business_name || 'עדי תכשיט שוקולד';
  const secondaryActive = SECONDARY.some(i => isActive(i.href));

  const linkClass = (active: boolean) => cn(
    'flex h-9 items-center whitespace-nowrap rounded-lg px-2.5 2xl:px-3 text-[14px] transition-colors',
    active
      ? 'bg-[#F5EBDD] font-semibold text-[#4A2E14] shadow-[inset_0_0_0_1px_#EAD8BE]'
      : 'font-medium text-[#5C4434] hover:bg-[#FAF4EC] hover:text-[#2B1A10]',
  );

  return (
    <>
      <header className="no-print z-40 flex h-16 flex-shrink-0 items-center gap-2 border-b border-[#E8DED2] bg-white px-4 lg:px-5 shadow-[0_1px_3px_rgba(58,42,26,0.05)]">
        {/* Brand — name shown only where there is room */}
        <Link href="/dashboard" className="ml-2 flex flex-shrink-0 items-center gap-2.5" title={businessName}>
          <img src={settings?.logo_url || '/logo.png'} alt={businessName} className="h-9 w-9 object-contain" />
          <span className="hidden flex-col leading-tight sm:flex md:hidden 2xl:flex">
            <span className="text-[14.5px] font-bold text-[#3A2A1A]">{businessName}</span>
            <span className="text-[11px] tracking-wider text-[#9B7A5A]">Adi Chocolate Boutique</span>
          </span>
        </Link>

        <span className="mx-1 hidden h-6 w-px flex-shrink-0 bg-[#EDE3D6] md:block" aria-hidden />

        {/* Desktop nav */}
        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex" aria-label="ניווט ראשי">
          {NAV_MAIN.map(item => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(linkClass(isActive(item.href)), item.secondary && 'hidden xl:flex')}
            >
              {item.label}
            </Link>
          ))}

          {/* "עוד" — the secondary items, below xl only */}
          <div ref={moreRef} className="relative xl:hidden">
            <button
              type="button"
              onClick={() => setMoreOpen(o => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={cn(linkClass(secondaryActive), 'gap-1')}
            >
              עוד
              <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-[#E8DED2] bg-white p-1.5 shadow-[var(--shadow-lg)]"
              >
                {SECONDARY.map(({ href, label, Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      role="menuitem"
                      className={cn(
                        'flex h-10 items-center gap-2.5 rounded-lg px-3 text-[14px]',
                        active ? 'bg-[#F5EBDD] font-semibold text-[#4A2E14]' : 'text-[#5C4434] hover:bg-[#FAF4EC]',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active ? 'text-[#8B5E34]' : 'text-[#9B7A5A]')} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Left side tools: search + system pages as icons */}
        <div className="hidden flex-shrink-0 items-center gap-1 md:flex">
          <button
            type="button"
            onClick={openSearch}
            aria-label="חיפוש גלובלי"
            title="חיפוש (Ctrl K)"
            className="flex h-9 items-center gap-2 rounded-lg border border-[#E8DED2] bg-[#FAF7F0] px-2.5 text-[13px] text-[#8A7664] hover:bg-[#F2EBDD] 2xl:min-w-[170px]"
          >
            <Search className="h-4 w-4" />
            <span className="hidden flex-1 text-right 2xl:inline">חיפוש...</span>
            <kbd className="hidden rounded border border-[#E8DED2] bg-white px-1.5 text-[11px] text-[#6B4A2D] 2xl:inline">Ctrl K</kbd>
          </button>
          <span className="mx-1 h-6 w-px bg-[#EDE3D6]" aria-hidden />
          {NAV_SYSTEM.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-[#F5EBDD] text-[#8B5E34]' : 'text-[#8A7664] hover:bg-[#FAF4EC] hover:text-[#5C3A1E]',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </Link>
            );
          })}
        </div>

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
          className="no-print fixed inset-0 top-16 z-30 bg-[rgba(20,12,4,0.25)] md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-[#E8DED2] bg-white p-3 shadow-lg"
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
