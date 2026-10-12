'use client';

import AppSidebar from '@/components/layout/AppSidebar';
import AssistantDrawer from '@/components/assistant/AssistantDrawer';
import GlobalSearch from '@/components/search/GlobalSearch';
import DemoBadge from '@/components/demo/DemoBadge';
import { KitchenTeamChat } from './dashboard/components/KitchenTeamChat';
import { Toaster } from 'react-hot-toast';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfirmProvider>
    <div className="app-shell flex h-[100dvh] overflow-hidden bg-[var(--bg)]">
      <AppSidebar />
      <main className="app-main flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 md:px-8 md:py-7">
          {children}
        </div>
      </main>

      <GlobalSearch />
      <AssistantDrawer />
      <DemoBadge />

      {/* צ'אט צוות פנימי — גלובלי לכל מסכי ה-CRM אחרי התחברות */}
      <KitchenTeamChat />

      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            direction: 'rtl',
            fontFamily: 'inherit',
            borderRadius: '12px',
            fontSize: '14px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          },
        }}
      />
    </div>
    </ConfirmProvider>
  );
}
