import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'עדי תכשיט שוקולד | מערכת ניהול',
  description: 'מערכת ניהול הזמנות ולקוחות — עדי תכשיט שוקולד',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
