'use client';

// Delete confirmation for one or several orders (owner's rules, Nov 2026):
//   • items go back to stock — the dialog says so;
//   • when a completed order is included, it asks whether its items return too;
//   • an order with an issued invoice needs "the invoice was cancelled" ticked.
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export interface DeleteChoice { restoreCompleted: boolean; invoiceCancelled: boolean }

interface Props {
  open: boolean;
  /** e.g. "ההזמנה ORD-1" or "3 הזמנות" */
  subject: string;
  completedCount: number;
  /** How many of the orders already have an invoice (0 = none / not known yet). */
  invoiceCount: number;
  loading?: boolean;
  onConfirm: (choice: DeleteChoice) => void;
  onClose: () => void;
}

export function OrderDeleteModal({ open, subject, completedCount, invoiceCount, loading, onConfirm, onClose }: Props) {
  const [restoreCompleted, setRestoreCompleted] = useState(false);
  const [invoiceCancelled, setInvoiceCancelled] = useState(false);
  useEffect(() => { if (open) { setRestoreCompleted(false); setInvoiceCancelled(false); } }, [open]);

  const needsInvoice = invoiceCount > 0;
  const blocked = needsInvoice && !invoiceCancelled;

  return (
    <Modal open={open} onClose={onClose} title="מחיקת הזמנה" size="sm">
      <div className="space-y-4 text-sm" style={{ color: '#6B4A2D' }}>
        <p>האם למחוק את {subject}? פעולה זו אינה ניתנת לביטול.</p>
        <p className="text-xs" style={{ color: '#8A7664' }}>המוצרים של הזמנה שלא הושלמה יחזרו למלאי.</p>

        {completedCount > 0 && (
          <label className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#E7DCCB' }}>
            <input type="checkbox" className="mt-0.5" checked={restoreCompleted} onChange={e => setRestoreCompleted(e.target.checked)} />
            <span>
              {completedCount === 1 ? 'ההזמנה כבר הושלמה.' : `${completedCount} מההזמנות כבר הושלמו.`}
              {' '}להחזיר גם את המוצרים שלהן למלאי?
            </span>
          </label>
        )}

        {needsInvoice && (
          <label className="flex items-start gap-2 rounded-xl border p-3 cursor-pointer" style={{ borderColor: '#F0C9C9', backgroundColor: '#FDF5F5' }}>
            <input type="checkbox" className="mt-0.5" checked={invoiceCancelled} onChange={e => setInvoiceCancelled(e.target.checked)} />
            <span>
              {invoiceCount === 1 ? 'להזמנה הופקה חשבונית.' : `ל-${invoiceCount} הזמנות הופקה חשבונית.`}
              {' '}<strong>החשבונית בוטלה / זוכתה במורנינג</strong>
            </span>
          </label>
        )}
      </div>
      <div className="flex gap-3 justify-end mt-6">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-xl border transition-colors hover:bg-amber-50 disabled:opacity-50"
          style={{ borderColor: '#D8CCBA', color: '#6B4A2D' }}
        >
          ביטול
        </button>
        <button
          onClick={() => onConfirm({ restoreCompleted, invoiceCancelled })}
          disabled={loading || blocked}
          className="px-4 py-2 text-sm font-medium rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: loading || blocked ? '#F2AAAA' : '#DC2626' }}
        >
          {loading ? '...' : 'מחק'}
        </button>
      </div>
    </Modal>
  );
}
