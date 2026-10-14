// PUBLIC page — the order request form customers fill in (/order-form/<token>).
// No login; the link token is checked against the current one in
// system_config, so the owner can replace or close the link at any time.
// Shows only the public catalog (active, non-business products at retail
// prices, VAT included) — nothing else from the CRM.
export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { loadSalesCatalog } from '@/lib/quotes-server';
import { currentFormToken, tokensMatch, publicCatalog } from '@/lib/order-form-server';
import { todayJerusalem } from '@/lib/finance';
import { PublicShell, PublicMessage, loadPublicBusiness } from '@/components/public/PublicShell';
import OrderForm from './OrderForm';

export const metadata: Metadata = { title: 'הזמנה', robots: { index: false, follow: false } };

export default async function OrderFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const [business, expected] = await Promise.all([loadPublicBusiness(), currentFormToken(supabase)]);

  if (!tokensMatch(token, expected)) {
    return (
      <PublicShell business={business}>
        <PublicMessage title="הטופס סגור כרגע" text="אפשר ליצור איתנו קשר בטלפון ונשמח לעזור." />
      </PublicShell>
    );
  }

  const { data: catalog } = await loadSalesCatalog(supabase);
  const pub = catalog ? publicCatalog(catalog) : null;
  if (!pub || (pub.products.length === 0 && pub.packages.length === 0)) {
    return (
      <PublicShell business={business}>
        <PublicMessage title="הטופס לא זמין כרגע" text="אפשר לנסות שוב מאוחר יותר או ליצור איתנו קשר." />
      </PublicShell>
    );
  }

  return (
    <PublicShell business={business}>
      <OrderForm token={token} products={pub.products} packages={pub.packages} today={todayJerusalem()} />
    </PublicShell>
  );
}
