// PUBLIC page — a price quote as the customer sees it, opened from the link
// the owner sent (/q/<random token>). No login; the token is the only key.
// Shows this one quote and an "approve" button — nothing else from the CRM.
export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils';
import { todayJerusalem, VAT_RATE, round2 } from '@/lib/finance';
import { PUBLIC_TOKEN_RE, quoteApprovable, quoteIsPreVat, lineTotal, type QuoteLine, type QuoteStatus } from '@/lib/quotes';
import { PublicShell, PublicMessage, loadPublicBusiness, PUBLIC_C as C } from '@/components/public/PublicShell';
import ApproveQuote from './ApproveQuote';

export const metadata: Metadata = { title: 'הצעת מחיר', robots: { index: false, follow: false } };

const fmtDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const business = await loadPublicBusiness();
  if (!PUBLIC_TOKEN_RE.test(token)) {
    return <PublicShell business={business}><PublicMessage title="הקישור לא תקין" text="ייתכן שהקישור הועתק חלקית." /></PublicShell>;
  }

  const { data: q } = await createAdminClient().from('הצעות_מחיר')
    .select('מספר_הצעה, סטטוס, פריטים, סוג_הנחה, ערך_הנחה, דמי_משלוח, סכום_לפני_הנחה, סכום_הנחה, סך_הכל, תוקף_עד, תאריך_אספקה_מבוקש, הערות_ללקוח, תאריך_אישור, תאריך_יצירה, לקוחות(שם_פרטי, שם_משפחה, סוג_לקוח, פטור_ממעמ)')
    .eq('טוקן', token).maybeSingle();
  if (!q) {
    return <PublicShell business={business}><PublicMessage title="ההצעה לא נמצאה" text="ייתכן שההצעה הוסרה. אפשר לפנות אלינו לקבלת הצעה חדשה." /></PublicShell>;
  }

  const customer = q.לקוחות as { שם_פרטי?: string; שם_משפחה?: string; סוג_לקוח?: string; פטור_ממעמ?: boolean } | null;
  const preVat = quoteIsPreVat(customer?.סוג_לקוח, customer?.פטור_ממעמ);
  const status = q.סטטוס as QuoteStatus;
  const lines = (q.פריטים ?? []) as QuoteLine[];
  const total = Number(q.סך_הכל) || 0;
  const discount = Number(q.סכום_הנחה) || 0;
  const shipping = Number(q.דמי_משלוח) || 0;
  const approved = status === 'אושרה' || status === 'הומרה להזמנה';
  const canApprove = quoteApprovable({ סטטוס: status, תוקף_עד: q.תוקף_עד }, todayJerusalem());
  const name = `${customer?.שם_פרטי ?? ''} ${customer?.שם_משפחה ?? ''}`.trim();

  return (
    <PublicShell business={business}>
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        <div className="px-5 py-4 flex flex-wrap items-baseline justify-between gap-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.head }}>הצעת מחיר</h2>
            {name && <p className="text-sm" style={{ color: C.soft }}>עבור {name}</p>}
          </div>
          <div className="text-xs text-left" style={{ color: C.soft }}>
            <div>מס׳ {q.מספר_הצעה}</div>
            <div>{fmtDate(String(q.תאריך_יצירה).slice(0, 10))}</div>
          </div>
        </div>

        <ul className="divide-y" style={{ borderColor: C.border }}>
          {lines.map((l, i) => (
            <li key={i} className="px-5 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: C.text }}>{l.שם}</div>
                <div className="text-xs mt-0.5" style={{ color: C.soft }}>
                  {l.כמות} × {formatCurrency(l.מחיר_ליחידה)}
                  {l.הערה ? ` · ${l.הערה}` : ''}
                </div>
              </div>
              <div className="text-sm tabular-nums shrink-0" style={{ color: C.text }}>{formatCurrency(lineTotal(l))}</div>
            </li>
          ))}
        </ul>

        <dl className="px-5 py-4 space-y-1.5 text-sm" style={{ borderTop: `1px solid ${C.border}`, backgroundColor: '#FBF7F0' }}>
          {(discount > 0 || shipping > 0) && (
            <div className="flex justify-between"><dt style={{ color: C.soft }}>סכום ביניים</dt><dd className="tabular-nums">{formatCurrency(Number(q.סכום_לפני_הנחה) || 0)}</dd></div>
          )}
          {discount > 0 && (
            <div className="flex justify-between" style={{ color: C.green }}>
              <dt>הנחה{q.סוג_הנחה === 'אחוז' ? ` (${Number(q.ערך_הנחה)}%)` : ''}</dt><dd className="tabular-nums">−{formatCurrency(discount)}</dd>
            </div>
          )}
          {shipping > 0 && (
            <div className="flex justify-between"><dt style={{ color: C.soft }}>משלוח</dt><dd className="tabular-nums">{formatCurrency(shipping)}</dd></div>
          )}
          {preVat ? (
            <>
              <div className="flex justify-between"><dt style={{ color: C.soft }}>סה״כ לפני מע״מ</dt><dd className="tabular-nums">{formatCurrency(total)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: C.soft }}>מע״מ {Math.round(VAT_RATE * 100)}%</dt><dd className="tabular-nums">{formatCurrency(round2(total * VAT_RATE))}</dd></div>
              <div className="flex justify-between pt-2 text-base font-bold" style={{ color: C.head, borderTop: `1px solid ${C.border}` }}>
                <dt>סה״כ לתשלום</dt><dd className="tabular-nums">{formatCurrency(round2(total * (1 + VAT_RATE)))}</dd>
              </div>
            </>
          ) : (
            <div className="flex justify-between pt-1 text-base font-bold" style={{ color: C.head }}>
              <dt>סה״כ לתשלום{customer?.פטור_ממעמ ? '' : ' (כולל מע״מ)'}</dt><dd className="tabular-nums">{formatCurrency(total)}</dd>
            </div>
          )}
        </dl>

        {(q.תאריך_אספקה_מבוקש || q.תוקף_עד || q.הערות_ללקוח) && (
          <div className="px-5 py-4 space-y-1.5 text-sm" style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
            {q.תאריך_אספקה_מבוקש && <p>תאריך אספקה: {fmtDate(q.תאריך_אספקה_מבוקש)}</p>}
            {q.תוקף_עד && <p style={{ color: C.soft }}>ההצעה בתוקף עד {fmtDate(q.תוקף_עד)}</p>}
            {q.הערות_ללקוח && <p className="whitespace-pre-line">{q.הערות_ללקוח}</p>}
          </div>
        )}
      </div>

      {approved ? (
        <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: C.greenBg, color: C.green }}>
          <p className="font-semibold">ההצעה אושרה. תודה!</p>
          <p className="text-sm mt-1">ניצור קשר להשלמת פרטי ההזמנה.</p>
        </div>
      ) : canApprove ? (
        <ApproveQuote token={token} />
      ) : (
        <PublicMessage
          title={status === 'נדחתה' ? 'ההצעה אינה בתוקף' : 'תוקף ההצעה פג'}
          text="אפשר לפנות אלינו ונשמח לשלוח הצעה מעודכנת."
        />
      )}
    </PublicShell>
  );
}
