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
      style={{ backgroundColor: 'rgba(20,12,4,0.22)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className={cn('bg-white rounded-2xl w-full', sizes[size])}
        style={{
          border: '1px solid #EAE0D4',
          boxShadow: '0 8px 32px rgba(58,42,26,0.10), 0 1px 0 rgba(255,255,255,0.8)',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {title && (
          <div
            className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
            style={{ borderColor: '#EAE0D4' }}
          >
            <h2 className="text-sm font-semibold" style={{ color: '#3A2A1A', letterSpacing: '0.1px' }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors text-base leading-none"
              style={{ color: '#B0A090' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F5F0E8')}
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
