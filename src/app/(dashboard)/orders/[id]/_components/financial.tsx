'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Order, Customer } from '@/types/database';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import type { FullOrder } from './types';
import { PAYMENT_PILL } from './constants';
import { Icon } from './fields';
// ─── FinancialActionsBar ─────────────────────────────────────────────────
// Horizontal full-width action bar (~110px tall on desktop) — replaces the
// previous tall card that was tucked into the order-detail aside. Title
// block sits on the start side (RTL = right) and the three action buttons
// fill a sub-grid on the end side. Buttons remain the same DocActionButton
// component used everywhere else; only the layout around them changed.

export function FinancialActionsBar({
  invoiceReceiptLoading,
  taxInvoiceLoading,
  receiptLoading,
  busy,
  hasManualMorning,
  onIssueInvoiceReceipt,
  onIssueTaxInvoice,
  onIssueReceipt,
  onMarkManualMorning,
  canSendInvoice,
  sendingInvoice,
  onSendInvoice,
  downloadingInvoice,
  onDownloadInvoice,
}: {
  invoiceReceiptLoading: boolean;
  taxInvoiceLoading: boolean;
  receiptLoading: boolean;
  busy: boolean;
  hasManualMorning: boolean;
  onIssueInvoiceReceipt: () => void;
  onIssueTaxInvoice: () => void;
  onIssueReceipt: () => void;
  onMarkManualMorning: () => void;
  // Manual "send invoice to customer" / "download invoice" — only actionable
  // once an issued document with a stored link exists. When false both buttons
  // render disabled with an explanatory label (no error-prone active button).
  canSendInvoice: boolean;
  sendingInvoice: boolean;
  onSendInvoice: () => void;
  downloadingInvoice: boolean;
  onDownloadInvoice: () => void;
}) {
  return (
    <Card style={{ paddingTop: 18, paddingBottom: 18 }}>
      {/* Warning banner when already marked as manually issued */}
      {hasManualMorning && (
        <div
          className="flex items-start gap-2 mb-4 rounded-lg px-3 py-2.5 text-[12px]"
          style={{ backgroundColor: '#FBF5E6', border: '1px solid #EDCF98', color: '#7A5820' }}
        >
          <span className="mt-px text-base leading-none">⚠️</span>
          <span>
            הזמנה זו סומנה כ<strong>הופקה ידנית במורנינג</strong>. הפקה נוספת דרך המערכת עלולה ליצור כפילות.
          </span>
        </div>
      )}

      <div
        className="grid items-center gap-4"
        style={{ gridTemplateColumns: 'minmax(0,1fr)' }}
      >
        {/* Inner responsive grid — desktop stacks title|buttons horizontally */}
        <div
          className="grid gap-4 lg:gap-5"
          style={{ gridTemplateColumns: 'minmax(220px,260px) 1fr' }}
        >
          {/* Title block */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <h3 className="text-[15px] font-bold leading-tight" style={{ color: '#2B1A10', letterSpacing: '-0.01em' }}>
                מסמכים פיננסיים
              </h3>
              <span
                className="text-[11.5px] font-bold uppercase px-1.5 py-0.5 rounded-md whitespace-nowrap"
                style={{ backgroundColor: '#F4E8D8', color: '#7A4820', letterSpacing: '0.06em' }}
              >
                ידני בלבד
              </span>
            </div>
            <p className="text-[11.5px] leading-snug" style={{ color: '#8A7664' }}>
              הפקה ידנית של חשבוניות וקבלות להזמנה
            </p>
          </div>

          {/* Action buttons — 3-up at desktop, collapses to 1 col on mobile */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <DocActionButton
                variant="primary"
                title="הפק חשבונית מס קבלה"
                hint="חשבונית וקבלה במסמך אחד"
                loading={invoiceReceiptLoading}
                disabled={busy && !invoiceReceiptLoading}
                onClick={onIssueInvoiceReceipt}
              />
              <DocActionButton
                variant="secondary"
                title="הפק חשבונית מס"
                hint="לתיעוד עסקה ללא קבלה"
                loading={taxInvoiceLoading}
                disabled={busy && !taxInvoiceLoading}
                onClick={onIssueTaxInvoice}
              />
              <DocActionButton
                variant="tertiary"
                title="הפק קבלה"
                hint="לאישור תשלום שהתקבל"
                loading={receiptLoading}
                disabled={busy && !receiptLoading}
                onClick={onIssueReceipt}
              />
            </div>

            {/* Manual-morning marker — separate row, visually distinct */}
            <button
              onClick={onMarkManualMorning}
              disabled={busy}
              className="w-full text-right rounded-xl px-4 py-2.5 text-[12.5px] font-medium flex items-center gap-2 transition-colors"
              style={{
                backgroundColor: hasManualMorning ? '#EAF0E7' : '#F5F1EB',
                border: `1px dashed ${hasManualMorning ? '#6B9E6B' : '#C5A882'}`,
                color: hasManualMorning ? '#33623A' : '#7A4820',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 15 }}>{hasManualMorning ? '✅' : '📋'}</span>
              <span>
                {hasManualMorning
                  ? 'סומן — הופקה ידנית במורנינג (הוסף עוד)'
                  : 'סמן שהופקה ידנית במורנינג'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Send / download invoice — full-width footer row of the financial
          documents card, so it's prominent and clearly part of this area.
          Always rendered; active only when a sendable document exists,
          otherwise disabled with an explanatory label (no error-prone click). */}
      <div className="mt-4 pt-4" style={{ borderTop: '1px solid #E8DED2' }}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
          <button
            onClick={onSendInvoice}
            disabled={!canSendInvoice || busy || sendingInvoice}
            title={canSendInvoice ? undefined : 'יש להפיק חשבונית עם קישור לפני שליחה ללקוח'}
            className="w-full rounded-xl px-4 py-3 text-[13.5px] font-bold flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: canSendInvoice ? '#8B5E34' : '#F0EAE0',
              color:           canSendInvoice ? '#fff' : '#9B7A5A',
              border:          canSendInvoice ? undefined : '1px dashed #C9B89E',
              cursor:          !canSendInvoice || busy || sendingInvoice ? 'not-allowed' : 'pointer',
              opacity:         (busy || sendingInvoice) && canSendInvoice ? 0.6 : 1,
            }}
          >
            <Icon name="mail" />
            <span>
              {!canSendInvoice
                ? 'לא ניתן לשלוח — לא הופקה חשבונית עם קישור'
                : sendingInvoice
                  ? 'שולח חשבונית...'
                  : 'שלח חשבונית ללקוח'}
            </span>
          </button>
          <button
            onClick={onDownloadInvoice}
            disabled={!canSendInvoice || downloadingInvoice}
            title={canSendInvoice ? 'הורד את קובץ ה-PDF של החשבונית' : 'יש להפיק חשבונית עם קישור כדי להוריד'}
            className="rounded-xl px-4 py-3 text-[13.5px] font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            style={{
              backgroundColor: '#F8F6F2',
              color:           canSendInvoice ? '#7A4820' : '#C5A882',
              border:          `1px solid ${canSendInvoice ? '#C9B89E' : '#E0D4C2'}`,
              cursor:          !canSendInvoice || downloadingInvoice ? 'not-allowed' : 'pointer',
              opacity:         !canSendInvoice ? 0.6 : downloadingInvoice ? 0.7 : 1,
            }}
          >
            <Icon name="download" />
            <span>{downloadingInvoice ? 'מוריד...' : 'הורד חשבונית'}</span>
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── FinancialDocumentsList ──────────────────────────────────────────────
// Documents list — grouped into the three doc-type categories. Renders
// nothing more than a tiny one-line empty state when there are no docs,
// so we don't bloat the page when the order has only just been created.

export type InvRow = { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string; קישור_חשבונית?: string | null; סוג_מסמך?: string | null; תאריך_יצירה?: string | null; מקור?: string | null; הערה?: string | null; נוצר_על_ידי?: string | null };

// Strip the internal `manual:` marker from displayed numbers and surface
// it as a "הופקה ידנית" badge instead. Mirrors the helper on /invoices.
export function prettyDocNumber(raw: string): { display: string; isManual: boolean } {
  const t = (raw ?? '').trim();
  if (!t) return { display: '', isManual: false };
  if (t.startsWith('manual:')) return { display: t.slice('manual:'.length).trim(), isManual: true };
  return { display: t, isManual: false };
}

// Per-row Hebrew badge tone. Picked so that two same-numbered docs of
// different types are immediately distinguishable at a glance.
export const DOC_ROW_BADGE: Record<'receipt' | 'tax_invoice' | 'invoice_receipt' | 'manual_other', { label: string; bg: string; fg: string }> = {
  receipt:         { label: 'קבלה',            bg: '#E4EEE8', fg: '#33623A' },
  tax_invoice:     { label: 'חשבונית מס',       bg: '#EAF0F5', fg: '#1E4E8C' },
  invoice_receipt: { label: 'חשבונית מס קבלה',  bg: '#FBF0E4', fg: '#7A4820' },
  manual_other:    { label: 'מסמך ידני',        bg: '#EFEAF5', fg: '#5B3F8B' },
};

export function rowCategory(i: InvRow): keyof typeof DOC_ROW_BADGE {
  const v = (i.סוג_מסמך ?? '').trim();
  if (v === 'invoice_receipt' || v === 'חשבונית_מס_קבלה') return 'invoice_receipt';
  if (v === 'tax_invoice') return 'tax_invoice';
  if (v === 'receipt') return 'receipt';
  return 'manual_other';
}

export function FinancialDocumentsList({ invoices }: { invoices: InvRow[] }) {
  const isInvoiceReceipt = (i: InvRow) => i.סוג_מסמך === 'invoice_receipt' || i.סוג_מסמך === 'חשבונית_מס_קבלה';
  const isTaxInvoice     = (i: InvRow) => i.סוג_מסמך === 'tax_invoice';
  const isReceipt        = (i: InvRow) => i.סוג_מסמך === 'receipt';
  // Fallback bucket: any document whose סוג_מסמך isn't one of the three
  // known types (legacy values, future types, manually-imported docs)
  // surfaces under "מסמכים נוספים" instead of vanishing from the UI.
  const isOther = (i: InvRow) =>
    !isInvoiceReceipt(i) && !isTaxInvoice(i) && !isReceipt(i);
  const groups: { label: string; items: InvRow[] }[] = [
    { label: 'חשבוניות מס קבלה', items: invoices.filter(isInvoiceReceipt) },
    { label: 'חשבוניות מס',      items: invoices.filter(isTaxInvoice) },
    { label: 'קבלות',            items: invoices.filter(isReceipt) },
    { label: 'מסמכים נוספים',    items: invoices.filter(isOther) },
  ].filter(g => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-[11.5px] py-1 px-2 text-center" style={{ color: '#8A7664' }}>
        עדיין לא הופקו מסמכים להזמנה זו.
      </p>
    );
  }

  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#8A7664', letterSpacing: '0.08em' }}>מסמכים שהופקו</p>
      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.label}>
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8A7664', letterSpacing: '0.06em' }}>
              {g.label}
            </p>
            <ul className="space-y-1">
              {g.items.map(inv => {
                const cat = rowCategory(inv);
                const tag = DOC_ROW_BADGE[cat];
                const { display, isManual } = prettyDocNumber(inv.מספר_חשבונית);
                const hasFile = !!inv.קישור_חשבונית;
                const isManualMorning = inv.מקור === 'manual_morning';
                return (
                  <li
                    key={inv.id}
                    className="text-[13px] px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: isManualMorning ? '#EAF0E7' : '#FAF7F0',
                      border: isManualMorning ? '1px solid #B7E0C0' : undefined,
                    }}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        {/* Per-row Hebrew badge */}
                        <span
                          className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: tag.bg, color: tag.fg }}
                        >
                          {tag.label}
                        </span>

                        {/* "ידנית במורנינג" badge — prominent green for manual_morning */}
                        {isManualMorning && (
                          <span
                            className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: '#DCFCE7', color: '#2A5C38', border: '1px solid #B7E0C0' }}
                          >
                            הופקה ידנית במורנינג
                          </span>
                        )}
                        {/* Legacy manual: prefix badge (not manual_morning) */}
                        {isManual && !isManualMorning && (
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded"
                            style={{ color: '#8B5E34', backgroundColor: '#FBF5E6', border: '1px solid #EDD9B4' }}
                            title="המסמך הופק ידנית — לא דרך מורנינג"
                          >
                            הופקה ידנית
                          </span>
                        )}

                        {/* Document number / link */}
                        {display ? (
                          hasFile ? (
                            <a
                              href={inv.קישור_חשבונית as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold hover:underline"
                              style={{ color: '#8B5E34', textUnderlineOffset: '2px' }}
                            >
                              #{display}
                            </a>
                          ) : (
                            <span className="font-semibold" style={{ color: '#2B1A10' }}>#{display}</span>
                          )
                        ) : (
                          hasFile && (
                            <a
                              href={inv.קישור_חשבונית as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[12px] hover:underline"
                              style={{ color: '#8B5E34' }}
                            >
                              פתח מסמך
                            </a>
                          )
                        )}

                        {inv.תאריך_יצירה && (
                          <span className="text-[11.5px]" style={{ color: '#8A7664' }}>
                            {formatDate(inv.תאריך_יצירה)}
                          </span>
                        )}
                        {/* "No file" notice — only for non-manual-morning rows */}
                        {!hasFile && !isManualMorning && (
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded"
                            style={{ color: '#8A7664', backgroundColor: '#E8DED2' }}
                            title="המסמך הופק ידנית ואין קובץ לצפייה"
                          >
                            אין קובץ במערכת
                          </span>
                        )}
                        {inv.נוצר_על_ידי && (
                          <span className="text-[11px]" style={{ color: '#8A7664' }}>
                            · {inv.נוצר_על_ידי}
                          </span>
                        )}
                      </div>
                      {/* Show amount only for non-manual-morning rows (amount is 0/unknown there) */}
                      {!isManualMorning && (
                        <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: '#8B5E34' }}>
                          {formatCurrency(inv.סכום)}
                        </span>
                      )}
                    </div>
                    {/* Note — shown below the main row when present */}
                    {isManualMorning && inv.הערה && (
                      <p className="mt-1 text-[11.5px]" style={{ color: '#4A7A5A' }}>
                        {inv.הערה}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── DocActionButton — premium action bar button for the financial documents
//
// Three variants matching the three doc types:
//   primary   — חשבונית מס קבלה. Mocha → muted-gold gradient, white text.
//               This is the most-used document; it gets the visual weight.
//   secondary — חשבונית מס. Cream surface with brown-gold border, brown text.
//   tertiary  — קבלה. White surface with a soft olive accent ring + brown text.
//
// Hover lifts the card by 1px, deepens the shadow, and strengthens the border.
// Active loading state replaces the title with "מפיק..." and disables the
// other buttons in the bar (handled by the parent through `disabled`).

export type DocVariant = 'primary' | 'secondary' | 'tertiary';

export function DocActionButton({
  variant, title, hint, onClick, loading, disabled,
}: {
  variant: DocVariant;
  title: string;
  hint: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  // Resting + hover styles per variant. Inline styles only — Tailwind doesn't
  // help with the gradient + brand colors we want here.
  const styles: Record<DocVariant, {
    bg:     string; bgHover: string;
    border: string; borderHover: string;
    text:   string; sub: string;
  }> = {
    primary: {
      bg:          'linear-gradient(135deg, #7A4820 0%, #8B5E34 55%, #A88554 100%)',
      bgHover:     'linear-gradient(135deg, #5C3A1E 0%, #7A4820 55%, #A88554 100%)',
      border:      '#5C3A1E',
      borderHover: '#4A2F1B',
      text:        '#FFFFFF',
      sub:         'rgba(255, 245, 220, 0.82)',
    },
    secondary: {
      bg:          '#F8F6F2',
      bgHover:     '#FBF5E6',
      border:      '#EDC898',
      borderHover: '#B09070',
      text:        '#2B1A10',
      sub:         '#8A7664',
    },
    tertiary: {
      bg:          '#FAF7F0',
      bgHover:     '#FAF7F0',
      border:      '#C9C8A7',
      borderHover: '#A0A077',
      text:        '#2B1A10',
      sub:         '#8A7664',
    },
  };
  const s = styles[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="group text-right rounded-2xl px-4 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        background:    s.bg,
        border:        `1px solid ${s.border}`,
        boxShadow:     variant === 'primary'
                         ? '0 2px 6px rgba(122,74,39,0.20), 0 1px 0 rgba(255,255,255,0.05) inset'
                         : '0 1px 2px rgba(58,42,26,0.04), 0 1px 0 rgba(255,255,255,0.6) inset',
        minHeight:     60,
      }}
      onMouseEnter={e => {
        if (disabled || loading) return;
        e.currentTarget.style.background = s.bgHover;
        e.currentTarget.style.borderColor = s.borderHover;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = variant === 'primary'
          ? '0 4px 12px rgba(122,74,39,0.28), 0 1px 0 rgba(255,255,255,0.08) inset'
          : '0 3px 10px rgba(58,42,26,0.10), 0 1px 0 rgba(255,255,255,0.6) inset';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = s.bg;
        e.currentTarget.style.borderColor = s.border;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = variant === 'primary'
          ? '0 2px 6px rgba(122,74,39,0.20), 0 1px 0 rgba(255,255,255,0.05) inset'
          : '0 1px 2px rgba(58,42,26,0.04), 0 1px 0 rgba(255,255,255,0.6) inset';
      }}
    >
      <div className="text-[13.5px] font-bold leading-tight" style={{ color: s.text, letterSpacing: '-0.01em' }}>
        {loading ? 'מפיק...' : title}
      </div>
      <div className="text-[11.5px] mt-1 leading-snug" style={{ color: s.sub }}>
        {hint}
      </div>
    </button>
  );
}

// ─── InvoicePreviewModal ─────────────────────────────────────────────────────
// Read-only preview shown before any document is issued. Surfaces customer
// details, line items, VAT breakdown, and (for receipt types) a payment-method
// picker. "אישור והנפקה" is the only path that triggers issuance.

export const DOC_LABEL: Record<'tax_invoice' | 'receipt' | 'invoice_receipt', string> = {
  tax_invoice:     'חשבונית מס',
  receipt:         'קבלה',
  invoice_receipt: 'חשבונית מס קבלה',
};

// Israeli VAT — used for display only; server-side Morning is authoritative.
export const IL_VAT = 0.18;

export function PreviewSec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] font-bold uppercase tracking-widest mb-1.5 pb-1 border-b"
        style={{ color: '#9B7A5A', borderColor: '#F5ECD8' }}>
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}

export function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-1 text-[12px] leading-5">
      <span className="shrink-0 pt-px" style={{ color: '#9B7A5A', minWidth: '3.5rem' }}>{label}</span>
      <span className="font-medium" style={{ color: '#2B1A10' }}>{value}</span>
    </div>
  );
}

export function InvoicePreviewModal({
  order,
  documentType,
  loading,
  onClose,
  onIssue,
}: {
  order: FullOrder;
  documentType: 'tax_invoice' | 'receipt' | 'invoice_receipt';
  loading: boolean;
  onClose: () => void;
  onIssue: (paymentMethod: string | undefined, force: boolean, invoiceNotes?: string, receiptName?: string, clientTaxId?: string) => void | Promise<void>;
}) {
  const [payMethod, setPayMethod]     = useState<string>('');
  const [customMethod, setCustomMethod] = useState<string>('');
  // Optional free-text notes printed on the Morning document (remarks).
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  // "שם לקבלה" — the name the document is made out to. Seeded below with the
  // ordering customer's name; the operator edits it when the receipt has to
  // go out to somebody else (spouse, paying company…).
  const [receiptName, setReceiptName] = useState<string>('');
  // ת.ז / ח.פ printed on the document. Seeded from the customer card below;
  // whatever stands here at issuance time is exactly what Morning receives,
  // so clearing it means the document goes out without a tax id.
  const [clientTaxId, setClientTaxId] = useState<string>('');

  const needsPayment    = documentType === 'receipt' || documentType === 'invoice_receipt';
  const effectiveMethod = payMethod === 'אחר' ? customMethod.trim() : payMethod;
  const canSubmit       = !needsPayment || !!effectiveMethod;
  const docLabel        = DOC_LABEL[documentType];

  const duplicate = (order.חשבוניות ?? []).some(i =>
    documentType === 'invoice_receipt'
      ? (i.סוג_מסמך === 'invoice_receipt' || i.סוג_מסמך === 'חשבונית_מס_קבלה')
      : i.סוג_מסמך === documentType,
  );

  const cust     = order.לקוחות;
  const custName = cust ? `${cust.שם_פרטי} ${cust.שם_משפחה}`.trim() : '';
  const custTaxId = (cust?.מספר_זהות ?? '').trim();
  // Pre-fill both document fields from the customer card. The modal is mounted
  // fresh on every open (it is rendered behind `previewDocType &&`), so these
  // run once per issuance and never clobber what the operator typed.
  useEffect(() => { setReceiptName(custName); }, [custName]);
  useEffect(() => { setClientTaxId(custTaxId); }, [custTaxId]);
  // Blank means "no override" — the document goes out to the customer.
  const effectiveReceiptName = receiptName.trim() || custName;
  const receiptNameChanged   = !!custName && effectiveReceiptName !== custName;
  const taxIdValue           = clientTaxId.trim();
  // Israeli ת.ז / ח.פ is 9 digits. A wrong one on a tax document is worse than
  // none, so flag anything else — as a hint, not a block: foreign customers
  // and edge cases exist and the operator is the one who knows.
  const taxIdLooksOdd        = !!taxIdValue && !/^\d{9}$/.test(taxIdValue.replace(/[\s-]/g, ''));

  // Keep the tax id honest as the name changes: the customer's ת.ז belongs to
  // the customer's name only. Moving away from it drops the card value, moving
  // back restores it — but anything the operator typed themselves is left be.
  const handleReceiptNameChange = (next: string) => {
    setReceiptName(next);
    const backToCustomer = next.trim() === custName;
    setClientTaxId(prev => {
      if (!backToCustomer && prev === custTaxId) return '';
      if (backToCustomer && prev === '')         return custTaxId;
      return prev;
    });
  };
  const items    = order.מוצרים_בהזמנה ?? [];
  const total    = order.סך_הכל_לתשלום ?? 0;
  const subtotal = order.סכום_לפני_הנחה ?? 0;
  const discount = order.סכום_הנחה ?? 0;
  const shipping = order.דמי_משלוח ?? 0;
  // `סך_הכל_לתשלום` semantics mirror the order screen (isBusinessForVat above):
  //   • Business (not Satmar): it is the NET — VAT is added on top, final
  //     payable = total × 1.18. The Morning EF does the same.
  //   • Private / Satmar: it is already the final GROSS — VAT is extracted
  //     from it for display only.
  const isBusinessForVat =
    (order.סוג_הזמנה as string | undefined) !== 'סאטמר' &&
    (cust?.סוג_לקוח === 'עסקי' ||
     cust?.סוג_לקוח === 'עסקי - קבוע' ||
     cust?.סוג_לקוח === 'עסקי - כמות');
  const exclVat  = isBusinessForVat ? total : +(total - total * IL_VAT / (1 + IL_VAT)).toFixed(2);
  const vatAmt   = isBusinessForVat ? +(total * IL_VAT).toFixed(2) : +(total * IL_VAT / (1 + IL_VAT)).toFixed(2);
  const finalPayable = isBusinessForVat ? +(total * (1 + IL_VAT)).toFixed(2) : total;

  const handleIssue = async () => {
    if (!canSubmit) return;
    await onIssue(
      needsPayment ? effectiveMethod : undefined,
      duplicate,
      invoiceNotes.trim() || undefined,
      // Only send an override when it actually differs from the customer —
      // otherwise the EF keeps its existing customer-name path (and the ת.ז).
      receiptNameChanged ? effectiveReceiptName : undefined,
      // Always sent — the modal is the source of truth for what Morning prints.
      taxIdValue,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mb-6"
        style={{ direction: 'rtl', border: '1px solid #E8DED2' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b" style={{ borderColor: '#E8DED2' }}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[16px] font-bold" style={{ color: '#2B1A10' }}>תצוגה מקדימה לחשבונית</h3>
            <span className="font-mono text-[11px] font-semibold" style={{ color: '#B09070' }}>{order.מספר_הזמנה}</span>
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: '#8A7664' }}>
            סוג מסמך: <strong style={{ color: '#7A4820' }}>{docLabel}</strong>
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Validation warnings */}
          {(!custName || items.length === 0 || total <= 0) && (
            <div className="rounded-lg px-3 py-2.5 text-[12px] space-y-1"
              style={{ backgroundColor: '#FEF3C7', border: '1px solid #EDCF98', color: '#7A5820' }}>
              <p className="font-semibold">שים לב לפני הנפקה:</p>
              {!custName          && <p>• לקוח לא מזוהה — פרטי לקוח חסרים</p>}
              {items.length === 0 && <p>• לא נמצאו פריטים בהזמנה</p>}
              {total <= 0         && <p>• סכום ההזמנה הוא ₪0 — יש לוודא שהמחירים הוזנו</p>}
            </div>
          )}

          {/* Existing invoice warning */}
          {duplicate && (
            <div className="rounded-lg px-3 py-2.5 text-[12px]"
              style={{ backgroundColor: '#FBF0E4', border: '1px solid #EDCF98', color: '#8B5E34' }}>
              ⚠ כבר קיים מסמך מסוג <strong>{docLabel}</strong> להזמנה זו. הפקה נוספת תיצור כפילות.
            </div>
          )}

          {/* Customer details */}
          <PreviewSec title="פרטי לקוח">
            {custName ? (
              <>
                <PreviewRow label="שם"     value={custName} />
                {cust?.טלפון  && <PreviewRow label="טלפון"  value={cust.טלפון} />}
                {cust?.אימייל && <PreviewRow label="אימייל" value={cust.אימייל} />}
                {cust?.מספר_זהות && <PreviewRow label="מספר זהות" value={cust.מספר_זהות} />}
              </>
            ) : (
              <p className="text-[12px]" style={{ color: '#C05A3C' }}>לקוח לא מזוהה</p>
            )}
          </PreviewSec>

          {/* "שם לקבלה" — the name the document is made out to. Pre-filled
              with the ordering customer; edited when the receipt has to be
              issued to someone else. */}
          <PreviewSec title="שם לקבלה">
            <input
              type="text"
              value={receiptName}
              onChange={e => handleReceiptNameChange(e.target.value)}
              maxLength={200}
              placeholder={custName || 'שם שיודפס על המסמך'}
              className="w-full px-3 h-9 text-[13px] rounded-lg border focus:outline-none focus:ring-2"
              style={{ borderColor: '#E8DED2', color: '#2B1A10', backgroundColor: '#F8F6F2' }}
            />
            {receiptNameChanged ? (
              <div className="mt-2 text-[12px] px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#FBF0E4', color: '#8B5E34', border: '1px solid #EDCF98' }}>
                המסמך יופק על שם <strong>{effectiveReceiptName}</strong> ולא על שם המזמין
                {custName ? <> ({custName})</> : null}.
                {custTaxId ? ' מספר הזהות של המזמין הוסר — הזיני למטה את הח.פ של הגורם שעל שמו הקבלה, אם יש.' : ''}
              </div>
            ) : (
              <p className="mt-1.5 text-[11.5px]" style={{ color: '#9B7A5A' }}>
                ממולא אוטומטית בשם המזמין — ניתן לשנות אם הקבלה צריכה לצאת על שם אחר.
              </p>
            )}
          </PreviewSec>

          {/* ת.ז / ח.פ printed on the document. Pre-filled from the customer
              card; whatever stands here is exactly what Morning receives. */}
          <PreviewSec title="מספר זהות / ח.פ">
            <input
              type="text"
              inputMode="numeric"
              value={clientTaxId}
              onChange={e => setClientTaxId(e.target.value)}
              maxLength={20}
              placeholder="ללא מספר זהות / ח.פ"
              className="w-full px-3 h-9 text-[13px] rounded-lg border focus:outline-none focus:ring-2"
              style={{ borderColor: '#E8DED2', color: '#2B1A10', backgroundColor: '#F8F6F2' }}
            />
            {taxIdLooksOdd ? (
              <div className="mt-2 text-[12px] px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#FEF3C7', color: '#7A5820', border: '1px solid #EDCF98' }}>
                ת.ז / ח.פ בישראל הוא 9 ספרות — ודאי שהמספר נכון לפני ההפקה.
              </div>
            ) : taxIdValue ? (
              <p className="mt-1.5 text-[11.5px]" style={{ color: '#9B7A5A' }}>
                יודפס על המסמך: <strong style={{ color: '#7A4820' }}>{taxIdValue}</strong>
              </p>
            ) : (
              <p className="mt-1.5 text-[11.5px]" style={{ color: '#9B7A5A' }}>
                ריק — המסמך יופק ללא מספר זהות / ח.פ. אפשר להקליד כאן גם אם לא שמור בכרטיס הלקוח.
              </p>
            )}
          </PreviewSec>

          {/* Order items */}
          <PreviewSec title={`פריטים (${items.length})`}>
            {items.length === 0 ? (
              <p className="text-[12px]" style={{ color: '#9B7A5A' }}>אין פריטים</p>
            ) : (
              <div className="space-y-1.5">
                {items.map((item, idx) => {
                  const name =
                    item.סוג_שורה === 'מארז'
                      ? `מארז ${item.גודל_מארז} פטיפורים`
                      : item.מוצרים_למכירה?.שם_מוצר ?? item.שם_פריט_מותאם ?? '—';
                  const qty       = item.כמות ?? 1;
                  const unitPrice = item.מחיר_ליחידה ?? 0;
                  const lineTotal = item.סהכ ?? qty * unitPrice;
                  return (
                    <div key={item.id ?? idx} className="flex items-center gap-2 text-[12px]">
                      <span
                        className="flex-shrink-0 w-6 text-center font-bold rounded text-[11.5px] leading-5"
                        style={{ backgroundColor: '#F4E8D8', color: '#8B5E34' }}
                      >
                        {qty}
                      </span>
                      <span className="flex-1 font-medium" style={{ color: '#2B1A10' }}>{name}</span>
                      {unitPrice > 0 && (
                        <span className="tabular-nums text-[11px]" style={{ color: '#9B7A5A' }}>₪{unitPrice}</span>
                      )}
                      <span className="tabular-nums font-semibold text-[11px]" style={{ color: '#4A2F1B' }}>
                        {formatCurrency(lineTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </PreviewSec>

          {/* Financial summary */}
          <PreviewSec title="סיכום פיננסי">
            <div className="space-y-1 text-[12px]">
              {subtotal > 0 && subtotal !== total && (
                <div className="flex justify-between">
                  <span style={{ color: '#9B7A5A' }}>סה״כ לפני הנחה</span>
                  <span style={{ color: '#2B1A10' }}>{formatCurrency(subtotal)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: '#9B7A5A' }}>הנחה</span>
                  <span style={{ color: '#2D6648' }}>−{formatCurrency(discount)}</span>
                </div>
              )}
              {shipping > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: '#9B7A5A' }}>דמי משלוח</span>
                  <span style={{ color: '#2B1A10' }}>{formatCurrency(shipping)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1" style={{ borderTop: '1px solid #F5ECD8' }}>
                <span style={{ color: '#9B7A5A' }}>לפני מע״מ</span>
                <span style={{ color: '#2B1A10' }}>{formatCurrency(exclVat)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#9B7A5A' }}>מע״מ 18%</span>
                <span style={{ color: '#2B1A10' }}>{formatCurrency(vatAmt)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-bold pt-1.5"
                style={{ borderTop: '2px solid #E8DED2' }}>
                <span style={{ color: '#2B1A10' }}>{isBusinessForVat ? 'סה״כ כולל מע״מ' : 'סה״כ לתשלום'}</span>
                <span style={{ color: '#8B5E34' }}>{formatCurrency(finalPayable)}</span>
              </div>
            </div>
          </PreviewSec>

          {/* Payment status */}
          <div className="flex items-center gap-2 text-[12px]">
            <span style={{ color: '#9B7A5A' }}>סטטוס תשלום:</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${PAYMENT_PILL[order.סטטוס_תשלום] ?? ''}`}>
              {order.סטטוס_תשלום}
            </span>
          </div>

          {/* Payment method picker — only for receipt / invoice_receipt */}
          {needsPayment && (
            <PreviewSec title="אמצעי תשלום *">
              <div className="grid grid-cols-4 gap-1.5">
                {PAY_OPTIONS.map(m => {
                  const active = payMethod === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      className="text-[11.5px] font-medium h-9 rounded-lg transition-colors border"
                      style={{
                        backgroundColor: active ? '#7A4820' : '#FFFFFF',
                        color:           active ? '#FFFFFF' : '#2B1A10',
                        borderColor:     active ? '#7A4820' : '#E8DED2',
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              {payMethod === 'אחר' && (
                <input
                  type="text"
                  value={customMethod}
                  onChange={e => setCustomMethod(e.target.value)}
                  placeholder="הקלידי אמצעי תשלום..."
                  className="mt-2 w-full px-3 h-9 text-[13px] rounded-lg border focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E8DED2', color: '#2B1A10' }}
                />
              )}
              {effectiveMethod && (
                <div className="mt-2 text-[12px] px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#EAF0E7', color: '#33623A', border: '1px solid #B8D5A8' }}>
                  ✓ המסמך יופק עם אמצעי תשלום: <strong>{effectiveMethod}</strong>
                </div>
              )}
            </PreviewSec>
          )}

          {/* Invoice notes — free text printed on the Morning document */}
          <PreviewSec title="הערות לחשבונית (אופציונלי)">
            <textarea
              value={invoiceNotes}
              onChange={e => setInvoiceNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="טקסט חופשי שיודפס על גבי המסמך..."
              className="w-full px-3 py-2 text-[13px] rounded-lg border focus:outline-none focus:ring-2 resize-none"
              style={{ borderColor: '#E8DED2', color: '#2B1A10', backgroundColor: '#F8F6F2' }}
            />
          </PreviewSec>

        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 flex gap-3 justify-end border-t" style={{ borderColor: '#E8DED2' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 h-10 text-[13px] font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: '#E8DED2', color: '#8A7664' }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleIssue}
            disabled={!canSubmit || loading}
            className="px-5 h-10 text-[13px] font-semibold rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#7A4820' }}
          >
            {loading ? 'מפיק...' : 'אישור והנפקה'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PaymentMethodModal — slim modal opened only by receipt + invoice_receipt
// Doc-type is decided by which button was pressed (no doc-type picker here).
// User picks a payment method and confirms. "אחר" reveals a free-text input;
// the server canonicalises and rejects unsupported names rather than picking
// a silent default.

export type DocTypeWithPayment = 'receipt' | 'invoice_receipt';

export const DOC_TITLE: Record<DocTypeWithPayment, string> = {
  receipt:         'קבלה',
  invoice_receipt: 'חשבונית מס קבלה',
};

export const PAY_OPTIONS: readonly string[] = [
  'כרטיס אשראי', 'מזומן', 'העברה בנקאית', 'ביט', 'PayBox', 'PayPal', 'צ\'ק', 'אחר',
];

export function PaymentMethodModal({
  orderNumber, documentType, duplicate, loading, onClose, onIssue,
}: {
  orderNumber: string;
  documentType: DocTypeWithPayment;
  duplicate: boolean;
  loading: boolean;
  onClose: () => void;
  onIssue: (paymentMethod: string, force: boolean) => void | Promise<void>;
}) {
  const confirm = useConfirm();
  const [payMethod, setPayMethod] = useState<string>('');
  const [customMethod, setCustomMethod] = useState<string>('');

  const effectiveMethod = payMethod === 'אחר' ? customMethod.trim() : payMethod;
  const canSubmit = !!effectiveMethod;
  const title = DOC_TITLE[documentType];

  const handleIssue = async () => {
    if (!canSubmit) return;
    if (duplicate) {
      const ok = await confirm(`כבר קיים מסמך מסוג ${title} להזמנה. הפקה נוספת עלולה ליצור כפילות. להמשיך?`);
      if (!ok) return;
    }
    await onIssue(effectiveMethod, duplicate);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mb-6"
        style={{ direction: 'rtl' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-lg font-bold" style={{ color: '#2B1A10' }}>הפקת {title}</h3>
          <span className="font-mono text-[11px] font-semibold" style={{ color: '#B09070', letterSpacing: '0.05em' }}>{orderNumber}</span>
        </div>
        <p className="text-[12px] mb-5" style={{ color: '#8A7664' }}>
          לפני הפקת ה{title} יש לבחור את אמצעי התשלום שיופיע על המסמך.
        </p>

        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#8A7664', letterSpacing: '0.08em' }}>
            אמצעי תשלום <span style={{ color: '#A8442D' }}>*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PAY_OPTIONS.map(m => {
              const active = payMethod === m;
              return (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className="text-[13px] font-medium h-10 rounded-lg transition-colors border"
                  style={{
                    backgroundColor: active ? '#7A4820' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#2B1A10',
                    borderColor: active ? '#7A4820' : '#E8DED2',
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {payMethod === 'אחר' && (
            <div className="mt-2">
              <input
                type="text"
                value={customMethod}
                onChange={e => setCustomMethod(e.target.value)}
                placeholder="הקלידי אמצעי תשלום (PayPlus / Stripe / וכו')"
                className="w-full px-3 h-10 text-[13px] rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: '#E8DED2', color: '#2B1A10' }}
              />
              <p className="text-[11.5px] mt-1" style={{ color: '#8A7664' }}>
                הערך יעבור מיפוי לפי הכללים הקיימים. אם לא נתמך — תוצג שגיאה ולא יופק מסמך.
              </p>
            </div>
          )}
        </div>

        {/* Confirmation strip — visible only after a method is picked.
            Owner-mandated: the user must see the exact method that will go
            on the document before clicking "הפק". If this line shows
            something different from what was picked, do NOT issue. */}
        {effectiveMethod && (
          <div className="text-[12px] mb-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#EAF0E7', color: '#33623A', border: '1px solid #B8D5A8' }}>
            ✓ המסמך יופק עם אמצעי תשלום: <strong>{effectiveMethod}</strong>
          </div>
        )}

        {duplicate && (
          <div className="text-[11.5px] mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: '#FBF0E4', color: '#8B5E34', border: '1px solid #EDCF98' }}>
            ⚠ קיים כבר מסמך {title} להזמנה זו. הפקה נוספת תיצור כפילות (תידרש אישור נוסף).
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 h-10 text-[13px] font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: '#E8DED2', color: '#8A7664' }}
          >
            ביטול
          </button>
          <button
            onClick={handleIssue}
            disabled={!canSubmit || loading}
            className="px-5 h-10 text-[13px] font-semibold rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#7A4820' }}
          >
            {loading ? 'מפיק...' : `הפק ${title}`}
          </button>
        </div>
      </div>
    </div>
  );
}
