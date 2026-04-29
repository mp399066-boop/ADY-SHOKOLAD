'use client';

import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title = 'אישור מחיקה',
  description = 'פעולה זו אינה ניתנת לביטול. האם להמשיך?',
  confirmLabel = 'מחק',
  loading,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm mb-6" style={{ color: '#6B4A2D' }}>{description}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-xl border transition-colors hover:bg-amber-50 disabled:opacity-50"
          style={{ borderColor: '#D8CCBA', color: '#6B4A2D' }}
        >
          ביטול
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: loading ? '#FCA5A5' : '#DC2626' }}
        >
          {loading ? '...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
