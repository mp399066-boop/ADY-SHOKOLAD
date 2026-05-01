'use client';

import NavBar from '@/components/layout/NavBar';
import { Toaster } from 'react-hot-toast';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#F8F6F2' }}>
      <NavBar />
      <div style={{ fontSize: '10px', color: '#C9A46A', textAlign: 'center', padding: '2px 0', backgroundColor: '#fff' }}>GLOBAL HEADER CLEANED V1</div>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full py-5 md:py-7" style={{ maxWidth: '1440px', paddingInline: '28px' }}>
          {children}
        </div>
      </main>

      <Toaster
        position="bottom-left"
        toastOptions={{
          style: {
            direction: 'rtl',
            fontFamily: 'inherit',
            borderRadius: '10px',
            fontSize: '13px',
            boxShadow: '0 4px 20px rgba(58,42,26,0.08), 0 0 0 1px rgba(58,42,26,0.04)',
            border: '1px solid #EAE0D4',
            color: '#3A2A1A',
          },
        }}
      />
    </div>
  );
}
