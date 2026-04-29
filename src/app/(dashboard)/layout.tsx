'use client';

import NavBar from '@/components/layout/NavBar';
import { Toaster } from 'react-hot-toast';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#F8F6F3' }}>
      <NavBar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full py-6 md:py-8" style={{ maxWidth: '1440px', paddingInline: '32px' }}>
          {children}
        </div>
      </main>

      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            direction: 'rtl',
            fontFamily: 'inherit',
            borderRadius: '14px',
            fontSize: '13px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
            border: '1px solid #E7E1D8',
            color: '#2B2B2B',
          },
        }}
      />
    </div>
  );
}
