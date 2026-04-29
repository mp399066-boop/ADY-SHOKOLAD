'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

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

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,10,5,0.28)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className={cn('bg-white rounded-3xl w-full', sizes[size])}
        style={{
          border: '1px solid #E7E1D8',
          boxShadow: '0 20px 60px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.03)',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {title && (
          <div
            className="flex items-center justify-between px-6 py-5 border-b flex-shrink-0"
            style={{ borderColor: '#E7E1D8' }}
          >
            <h2 className="text-base font-semibold" style={{ color: '#2B2B2B' }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors text-lg leading-none"
              style={{ color: '#7A7A7A', backgroundColor: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F2EDE6')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              ×
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
