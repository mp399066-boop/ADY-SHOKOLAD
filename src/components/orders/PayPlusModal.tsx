'use client';

import { useState } from 'react';

export const PAYPLUS_STATIC_LINK = process.env.NEXT_PUBLIC_PAYPLUS_STATIC_PAYMENT_LINK ?? '';

// Static PayPlus payment-link flow. Shows the remaining balance prominently
// so the operator can copy it before opening the fixed PayPlus payment page.
// Payment status is NEVER auto-updated — operator marks שולם manually.

export function PayPlusModal({
  amount,
  orderNumber,
  customerName,
  onClose,
}: {
  amount: number;
  orderNumber: string;
  customerName: string;
  onClose: () => void;
}) {
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedOrder,  setCopiedOrder]  = useState(false);

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-xl p-5"
        style={{ backgroundColor: '#F8F6F2', border: '1px solid #E8DED2', direction: 'rtl' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold mb-4" style={{ color: '#2B1A10' }}>
          סכום לתשלום ב־PayPlus
        </h2>

        <div className="mb-4 space-y-1.5">
          <div
            className="flex justify-between items-center px-3 py-2.5 rounded-xl"
            style={{ backgroundColor: '#F4E8D8', border: '1px solid #EDD9B4' }}
          >
            <span className="text-xs font-medium" style={{ color: '#6B4A2D' }}>סכום לתשלום</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: '#8B5E34' }}>
              ₪{amount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center px-3 py-1.5">
            <span className="text-xs font-medium" style={{ color: '#6B4A2D' }}>מספר הזמנה</span>
            <span className="text-sm font-semibold" style={{ color: '#2B1A10' }}>{orderNumber}</span>
          </div>
          <div className="flex justify-between items-center px-3 py-1.5">
            <span className="text-xs font-medium" style={{ color: '#6B4A2D' }}>לקוח</span>
            <span className="text-sm font-semibold" style={{ color: '#2B1A10' }}>{customerName}</span>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => copyText(amount.toFixed(2), setCopiedAmount)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: copiedAmount ? '#DCFCE7' : '#F4E8D8',
              color:           copiedAmount ? '#2D6648' : '#7A4820',
              border:          `1px solid ${copiedAmount ? '#BBF7D0' : '#EDD9B4'}`,
            }}
          >
            {copiedAmount ? '✓ הועתק' : 'העתק סכום'}
          </button>
          <button
            type="button"
            onClick={() => copyText(orderNumber, setCopiedOrder)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: copiedOrder ? '#DCFCE7' : '#F4E8D8',
              color:           copiedOrder ? '#2D6648' : '#7A4820',
              border:          `1px solid ${copiedOrder ? '#BBF7D0' : '#EDD9B4'}`,
            }}
          >
            {copiedOrder ? '✓ הועתק' : 'העתק מספר הזמנה'}
          </button>
        </div>

        {PAYPLUS_STATIC_LINK ? (
          <a
            href={PAYPLUS_STATIC_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2.5 rounded-xl text-sm font-bold text-center mb-3"
            style={{ backgroundColor: '#33623a', color: '#FFFFFF' }}
          >
            פתח קישור PayPlus
          </a>
        ) : (
          <p
            className="text-xs text-center mb-3 px-2 py-2 rounded-lg"
            style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}
          >
            קישור PayPlus לא מוגדר — הוסף NEXT_PUBLIC_PAYPLUS_STATIC_PAYMENT_LINK בהגדרות הסביבה.
          </p>
        )}

        <p className="text-[11px] text-center px-2 mb-3" style={{ color: '#9B7A5A' }}>
          לאחר קבלת אישור תשלום, יש לסמן את ההזמנה כשולמה ידנית.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-lg text-xs font-medium"
          style={{ backgroundColor: '#F0EAE0', color: '#8A7664', border: '1px solid #E0D4C2' }}
        >
          סגור
        </button>
      </div>
    </div>
  );
}
