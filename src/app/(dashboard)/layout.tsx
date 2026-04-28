'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import { Toaster } from 'react-hot-toast';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F5F0' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden md:mr-0">
        <TopBar onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>

      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            direction: 'rtl',
            fontFamily: 'inherit',
            borderRadius: '14px',
            fontSize: '13px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
            border: 'none',
          },
        }}
      />
    </div>
  );
}
