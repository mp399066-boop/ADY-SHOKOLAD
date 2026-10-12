'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ShoppingBag, Users, Truck, Gift, Boxes, ChefHat, Factory, Calculator,
  Receipt, Wallet, UserCog, BarChart3, Upload, Settings, Search, Plus, Menu, X,
  PanelRightClose, PanelRightOpen, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BusinessSettings } from '@/types/database';

interface NavItem { href: string; label: string; Icon: LucideIcon }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: 'עבודה שוטפת',
    items: [
      { href: '/dashboard',  label: 'דשבורד',  Icon: LayoutDashboard },
      { href: '/orders',     label: 'הזמנות',  Icon: ShoppingBag },
      { href: '/customers',  label: 'לקוחות',  Icon: Users },
      { href: '/deliveries', label: 'משלוחים', Icon: Truck },
    ],
  },
  {
    title: 'ייצור ומלאי',
    items: [
      { href: '/products',  label: 'מוצרים',        Icon: Gift },
      { href: '/inventory', label: 'מלאי',          Icon: Boxes },
      { href: '/recipes',   label: 'מתכונים',       Icon: ChefHat },
      { href: '/suppliers', label: 'ספקים',         Icon: Factory },
      { href: '/costs',     label: 'עלויות מוצרים', Icon: Calculator },
    ],
  },
  {
    title: 'כספים',
    items: [
      { href: '/invoices', label: 'חשבוניות וקבלות', Icon: Receipt },
      { href: '/finance',  label: 'פיננסים',         Icon: Wallet },
    ],
  },
  {
    title: 'צוות ומערכת',
    items: [
      { href: '/employees',      label: 'עובדים / משימות', Icon: UserCog },
      { href: '/reports/orders', label: 'דוחות',           Icon: BarChart3 },
      { href: '/import',         label: 'ייבוא',           Icon: Upload },
      { href: '/settings',       label: 'הגדרות',          Icon: Settings },
    ],
  },
];

const COLLAPSE_KEY = 'nav:collapsed';

function openSearch() {
  window.dispatchEvent(new Event('global-search:open'));
}

export default function AppSidebar() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Via the API: business_settings has RLS with no browser policy.
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.data) setSettings(j.data as BusinessSettings); })
      .catch(() => {});
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* storage blocked */ }
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage blocked */ }
      return !c;
    });
  };

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const businessName = settings?.business_name || 'עדי תכשיט שוקולד';
  const logo = settings?.logo_url || '/logo.png';

  const navBody = (compact: boolean) => (
    <>
      {/* Quick actions */}
      <div className={cn('flex flex-col gap-2 px-3 pt-3 pb-2', compact && 'items-center px-2')}>
        <Link
          href="/orders/new"
          title="הזמנה חדשה"
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl font-semibold text-white shadow-sm',
            'bg-[#8B5E34] hover:bg-[#7A5020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A46A]',
            compact ? 'h-10 w-10' : 'h-10 text-[13.5px]',
          )}
        >
          <Plus className="h-4 w-4 flex-shrink-0" strokeWidth={2.4} />
          {!compact && 'הזמנה חדשה'}
        </Link>
        <button
          type="button"
          onClick={openSearch}
          title="חיפוש (Ctrl K)"
          aria-label="חיפוש גלובלי"
          className={cn(
            'flex items-center gap-2 rounded-xl border border-[#E8DED2] bg-[#FAF7F0] text-[#8A7664] hover:bg-[#F2EBDD]',
            compact ? 'h-10 w-10 justify-center' : 'h-9 px-3 text-[13px]',
          )}
        >
          <Search className="h-4 w-4 flex-shrink-0" />
          {!compact && (
            <>
              <span className="flex-1 text-right">חיפוש...</span>
              <kbd className="rounded border border-[#E8DED2] bg-white px-1.5 text-[11.5px] text-[#6B4A2D]">Ctrl K</kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="ניווט ראשי">
        {NAV.map(group => (
          <div key={group.title} className="mt-4 first:mt-2">
            {compact ? (
              <div className="mx-auto mb-2 h-px w-6 bg-[#E8DED2]" />
            ) : (
              <div className="mb-1.5 px-3 text-[11.5px] font-semibold tracking-wide text-[#B0A090]">
                {group.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={compact ? label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-lg text-[14px] transition-colors',
                        compact ? 'h-10 w-10 mx-auto justify-center' : 'h-11 md:h-10 px-3',
                        active
                          ? 'bg-[#F5EBDD] font-semibold text-[#5C3A1E]'
                          : 'font-medium text-[#6B4A2D] hover:bg-[#FAF4EC] hover:text-[#2B1A10]',
                      )}
                    >
                      {active && !compact && (
                        <span className="absolute inset-y-2 right-0 w-[3px] rounded-l-full bg-[#C9A46A]" aria-hidden />
                      )}
                      <Icon
                        className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-[#8B5E34]' : 'text-[#9B7A5A] group-hover:text-[#8B5E34]')}
                        strokeWidth={active ? 2.2 : 1.8}
                      />
                      {!compact && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        className={cn(
          'no-print hidden md:flex flex-col flex-shrink-0 h-full border-l border-[#E8DED2] bg-white transition-[width] duration-200',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
      >
        <div className={cn('flex h-[60px] flex-shrink-0 items-center gap-2.5 border-b border-[#F0EAE0]', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" title={businessName}>
            <img src={logo} alt={businessName} className="h-9 w-9 flex-shrink-0 rounded-lg object-contain" />
            {!collapsed && (
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[14.5px] font-bold text-[#3A2A1A]">{businessName}</span>
                <span className="text-[11px] tracking-wider text-[#9B7A5A]">Chocolate Boutique</span>
              </span>
            )}
          </Link>
        </div>

        {navBody(collapsed)}

        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-11 flex-shrink-0 items-center justify-center gap-2 border-t border-[#F0EAE0] text-[12.5px] text-[#8A7664] hover:bg-[#FAF7F0] hover:text-[#5C3A1E]"
          aria-label={collapsed ? 'הרחבת התפריט' : 'כיווץ התפריט'}
          title={collapsed ? 'הרחבת התפריט' : 'כיווץ התפריט'}
        >
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <><PanelRightClose className="h-4 w-4" /><span>כיווץ תפריט</span></>}
        </button>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────── */}
      <header className="no-print md:hidden fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-[#E8DED2] bg-white/95 px-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6B4A2D] hover:bg-[#FAF4EC]"
          aria-label="פתיחת תפריט"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2">
          <img src={logo} alt="" className="h-8 w-8 rounded-md object-contain" />
          <span className="truncate text-[15px] font-bold text-[#3A2A1A]">{businessName}</span>
        </Link>
        <button
          type="button"
          onClick={openSearch}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6B4A2D] hover:bg-[#FAF4EC]"
          aria-label="חיפוש"
        >
          <Search className="h-5 w-5" />
        </button>
        <Link
          href="/orders/new"
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#8B5E34] text-white"
          aria-label="הזמנה חדשה"
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} />
        </Link>
      </header>

      {/* ── Mobile drawer ───────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="no-print md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="תפריט">
          <div className="absolute inset-0 bg-[rgba(20,12,4,0.35)]" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[82vw] max-w-[300px] flex-col bg-white shadow-2xl">
            <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-[#F0EAE0] px-4">
              <img src={logo} alt="" className="h-8 w-8 rounded-md object-contain" />
              <span className="flex-1 truncate text-[15px] font-bold text-[#3A2A1A]">{businessName}</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-[#8A7664] hover:bg-[#FAF4EC]"
                aria-label="סגירת תפריט"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navBody(false)}
          </div>
        </div>
      )}
    </>
  );
}
