'use client';

// "מסמכים פיננסיים" page. The DB table is `חשבוניות` and the URL is
// /invoices for backward-compat, but the *content* is a mix of receipts,
// tax invoices, and combined invoice-receipts — calling all of them
// "חשבוניות" was confusing, so the page header + the surrounding nav use
// the broader label and surface a per-row doc-type badge.
//
// No DB / API / Morning changes. The /api/invoices GET already returns
// סוג_מסמך via select('*'); we just consume it here.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Invoice } from '@/types/database';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport, IconExternalLink } from '@/components/icons';

// ── Doc-type meta ─────────────────────────────────────────────────────────

type DocCategory = 'receipt' | 'tax_invoice' | 'invoice_receipt' | 'manual_other';

const DOC_LABEL: Record<DocCategory, string> = {
  receipt:         'קבלה',
  tax_invoice:     'חשבונית מס',
  invoice_receipt: 'חשבונית מס קבלה',
  manual_other:    'מסמך ידני',
};

const DOC_BADGE: Record<DocCategory, { bg: string; fg: string; border: string }> = {
  receipt:         { bg: '#E8F4EC', fg: '#1F6B3E', border: '#BBE0C8' },
  tax_invoice:     { bg: '#EAF2FB', fg: '#1E4E8C', border: '#C0D6F0' },
  invoice_receipt: { bg: '#F4E9DC', fg: '#7A4A27', border: '#D8B98F' },
  manual_other:    { bg: '#F1ECF7', fg: '#5B3A8C', border: '#D5C6E5' },
};

function categorize(raw: string | null | undefined): DocCategory {
  const v = (raw ?? '').trim();
  if (v === 'receipt') return 'receipt';
  if (v === 'tax_invoice') return 'tax_invoice';
  if (v === 'invoice_receipt' || v === 'חשבונית_מס_קבלה') return 'invoice_receipt';
  return 'manual_other';
}

// `manual:` prefix is an internal marker used when the document was
// recorded manually (no Morning API round-trip). It must not be shown to
// the user as part of the document number — surface a "הופקה ידנית" badge
// instead. Returns the cleaned number + a flag so the caller can decide
// where to render the badge.
function prettyInvoiceNumber(raw: string): { display: string; isManual: boolean } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { display: '—', isManual: false };
  if (trimmed.startsWith('manual:')) {
    return { display: trimmed.slice('manual:'.length).trim() || '—', isManual: true };
  }
  return { display: trimmed, isManual: false };
}

// ── Filter chips ──────────────────────────────────────────────────────────

type Filter = 'all' | DocCategory | 'no_file';

const FILTER_CHIPS: { value: Filter; label: string }[] = [
  { value: 'all',             label: 'הכל'                },
  { value: 'receipt',         label: 'קבלות'              },
  { value: 'tax_invoice',     label: 'חשבוניות מס'         },
  { value: 'invoice_receipt', label: 'חשבוניות מס קבלה'   },
  { value: 'manual_other',    label: 'מסמכים ידניים'      },
  { value: 'no_file',         label: 'ללא קובץ'           },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    fetch('/api/invoices')
      .then(r => r.json())
      .then(({ data }) => setInvoices(data || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return invoices;
    if (filter === 'no_file') return invoices.filter(inv => !inv.קישור_חשבונית);
    return invoices.filter(inv => categorize(inv.סוג_מסמך) === filter);
  }, [invoices, filter]);

  // Counts shown next to chips — based on the unfiltered list so totals
  // stay honest while the operator narrows the view.
  const counts = useMemo(() => ({
    all:             invoices.length,
    receipt:         invoices.filter(inv => categorize(inv.סוג_מסמך) === 'receipt').length,
    tax_invoice:     invoices.filter(inv => categorize(inv.סוג_מסמך) === 'tax_invoice').length,
    invoice_receipt: invoices.filter(inv => categorize(inv.סוג_מסמך) === 'invoice_receipt').length,
    manual_other:    invoices.filter(inv => categorize(inv.סוג_מסמך) === 'manual_other').length,
    no_file:         invoices.filter(inv => !inv.קישור_חשבונית).length,
  }), [invoices]);

  const handleExport = () => {
    exportToCsv('מסמכים-פיננסיים.csv',
      ['סוג מסמך', 'מספר מסמך', 'הופקה ידנית', 'לקוח', 'הזמנה', 'סכום', 'סטטוס', 'תאריך'],
      filtered.map(inv => {
        const cat = categorize(inv.סוג_מסמך);
        const { display, isManual } = prettyInvoiceNumber(inv.מספר_חשבונית);
        return [
          DOC_LABEL[cat],
          display,
          isManual ? 'כן' : '',
          inv.לקוחות ? `${inv.לקוחות.שם_פרטי} ${inv.לקוחות.שם_משפחה}` : '',
          inv.הזמנות?.מספר_הזמנה || '',
          inv.סכום,
          inv.סטטוס,
          inv.תאריך_יצירה,
        ];
      }),
    );
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Page header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>מסמכים פיננסיים</h1>
          <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
            קבלות, חשבוניות מס וחשבוניות מס קבלה — מאוגדים בעמוד אחד עם תגית סוג מסמך לכל שורה.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map(chip => {
          const active = filter === chip.value;
          const count = counts[chip.value];
          // Hide chips that would show 0 unless they're the "all" anchor.
          if (chip.value !== 'all' && count === 0) return null;
          return (
            <button
              key={chip.value}
              onClick={() => setFilter(chip.value)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold transition-colors"
              style={{
                backgroundColor: active ? '#2F1B14' : '#FFFFFF',
                color: active ? '#FFFFFF' : '#3A2A1A',
                border: `1px solid ${active ? '#2F1B14' : '#E8D8C6'}`,
              }}
            >
              {chip.label}
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums"
                style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.18)' : '#F4E9DC',
                  color: active ? '#FFFFFF' : '#5A3424',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {invoices.length === 0 ? (
        <EmptyState title="אין מסמכים" description="מסמכים פיננסיים יופיעו כאן לאחר הפקה" />
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm" style={{ color: '#8A7664' }}>
          אין מסמכים שתואמים את הסינון הנוכחי.
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                  {['סוג מסמך', 'מספר מסמך', 'לקוח', 'הזמנה', 'סכום', 'סטטוס', 'תאריך', 'קישור'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const cat = categorize(inv.סוג_מסמך);
                  const badge = DOC_BADGE[cat];
                  const { display, isManual } = prettyInvoiceNumber(inv.מספר_חשבונית);
                  const customer = inv.לקוחות;
                  const order = inv.הזמנות;
                  const hasFile = !!inv.קישור_חשבונית;
                  return (
                    <tr key={inv.id} className="border-b hover:bg-amber-50" style={{ borderColor: '#F5ECD8' }}>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                          style={{ backgroundColor: badge.bg, color: badge.fg, borderColor: badge.border }}
                        >
                          {DOC_LABEL[cat]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-medium" style={{ color: '#8B5E34' }}>#{display}</span>
                          {isManual && (
                            <span
                              className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: '#FBF3E4', color: '#8B5E34', border: '1px solid #E8D2A8' }}
                              title="המסמך הופק ידנית — לא דרך מורנינג"
                            >
                              הופקה ידנית
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{customer ? `${customer.שם_פרטי} ${customer.שם_משפחה}` : '-'}</td>
                      <td className="px-4 py-3">
                        <Link href={`/orders/${inv.הזמנה_id}`} className="hover:underline text-xs" style={{ color: '#8B5E34' }}>
                          {order?.מספר_הזמנה || '-'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(inv.סכום)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${inv.סטטוס === 'שולמה' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {inv.סטטוס}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{formatDate(inv.תאריך_יצירה)}</td>
                      <td className="px-4 py-3">
                        {hasFile ? (
                          <a
                            href={inv.קישור_חשבונית as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="פתח PDF"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#B08060] hover:bg-amber-50 hover:text-[#8B5E34] transition-colors"
                          >
                            <IconExternalLink className="w-4 h-4" />
                          </a>
                        ) : (
                          // Disabled view button + clarifying badge so it's
                          // obvious the operator can't open a PDF (and why).
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md cursor-not-allowed"
                              style={{ color: '#C7B7A0', backgroundColor: '#FAF7F0' }}
                              title="המסמך הופק ידנית ואין קובץ לצפייה"
                              aria-disabled="true"
                            >
                              <IconExternalLink className="w-4 h-4 opacity-50" />
                            </span>
                            <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: '#8A7664' }}>
                              אין קובץ במערכת
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
