import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'עדי תכשיט שוקולד — מערכת ניהול',
    short_name: 'עדי שוקולד',
    description: 'מערכת ניהול הזמנות ולקוחות',
    start_url: '/dashboard',
    display: 'standalone',
    dir: 'rtl',
    lang: 'he',
    background_color: '#F8F6F2',
    theme_color: '#8B5E34',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
