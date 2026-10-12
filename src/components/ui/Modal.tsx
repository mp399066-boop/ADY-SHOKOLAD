'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Phones: a bottom sheet that uses the full width. Larger screens: centered dialog.
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[rgba(20,12,4,0.32)] backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'flex w-full flex-col bg-white border border-[#E8DED2] shadow-[var(--shadow-lg)]',
          'max-h-[92dvh] rounded-t-2xl sm:rounded-2xl',
          SIZES[size],
        )}
      >
        {title && (
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[#F0EAE0] px-5 py-4 sm:px-6">
            <h2 className="text-base font-bold text-[#2B1A10]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגירה"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#8A7664] hover:bg-[#F5F0E8] hover:text-[#3A2A1A]"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
