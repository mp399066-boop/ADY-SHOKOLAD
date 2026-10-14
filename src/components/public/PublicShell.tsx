// Frame for the PUBLIC pages customers open without logging in
// (/q/<token> quote, /order-form/<token>). Server component: shows the
// business name / logo / phone only — nothing else from the CRM.
import { createAdminClient } from '@/lib/supabase/server';

import { PUBLIC_C } from './public-colors';
export { PUBLIC_C };

export interface PublicBusiness {
  name: string;
  logo: string | null;
  phone: string | null;
}

export async function loadPublicBusiness(): Promise<PublicBusiness> {
  try {
    const { data } = await createAdminClient()
      .from('business_settings').select('business_name, logo_url, phone').limit(1).maybeSingle();
    return {
      name: data?.business_name || 'עדי תכשיט שוקולד',
      logo: data?.logo_url || null,
      phone: data?.phone || null,
    };
  } catch {
    return { name: 'עדי תכשיט שוקולד', logo: null, phone: null };
  }
}

export function PublicShell({ business, children }: { business: PublicBusiness; children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen px-4 py-6 sm:py-10" style={{ backgroundColor: PUBLIC_C.bg }}>
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="flex flex-col items-center gap-2 text-center">
          {business.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- logo URL comes from settings, any host
            <img src={business.logo} alt="" className="h-16 w-16 rounded-2xl object-contain bg-white" style={{ border: `1px solid ${PUBLIC_C.border}` }} />
          )}
          <h1 className="text-xl font-bold" style={{ color: PUBLIC_C.head }}>{business.name}</h1>
        </header>
        {children}
        {business.phone && (
          <p className="text-center text-xs" style={{ color: PUBLIC_C.soft }}>
            לשאלות: <a href={`tel:${business.phone}`} className="underline" dir="ltr">{business.phone}</a>
          </p>
        )}
      </div>
    </div>
  );
}

export function PublicMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: PUBLIC_C.card, border: `1px solid ${PUBLIC_C.border}` }}>
      <h2 className="text-lg font-semibold mb-1" style={{ color: PUBLIC_C.head }}>{title}</h2>
      <p className="text-sm" style={{ color: PUBLIC_C.soft }}>{text}</p>
    </div>
  );
}
