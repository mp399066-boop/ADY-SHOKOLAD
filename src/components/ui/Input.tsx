import { cn } from '@/lib/utils';
import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, required, ...props }: InputProps) {
  const inputId = id || label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>
          {label}
          {required && <span className="mr-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-xl border bg-white transition-all duration-200',
          error ? 'border-red-300 focus:border-red-400' : 'border-[#E0D4C4] focus:border-[#C7A46B]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:ring-red-200' : 'focus:ring-amber-100',
          'placeholder:text-[#BFB09A]',
          className,
        )}
        style={{ color: '#2B1A10' }}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs" style={{ color: '#9B7A5A' }}>{hint}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, required, ...props }: TextareaProps) {
  const inputId = id || label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>
          {label}
          {required && <span className="mr-0.5 text-red-500">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-xl border bg-white transition-all duration-200 resize-y',
          error ? 'border-red-400 focus:border-red-400' : 'border-[#DDD0BC] focus:border-[#C7A46B]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:ring-red-200' : 'focus:ring-amber-100',
          'placeholder:text-[#BFB09A]',
          className,
        )}
        style={{ color: '#2B1A10' }}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className, id, required, children, ...props }: SelectProps) {
  const inputId = id || label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>
          {label}
          {required && <span className="mr-0.5 text-red-500">*</span>}
        </label>
      )}
      <select
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-xl border bg-white transition-all duration-200',
          error ? 'border-red-300 focus:border-red-400' : 'border-[#E0D4C4] focus:border-[#C7A46B]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:ring-red-200' : 'focus:ring-amber-100',
          className,
        )}
        style={{ color: '#2B1A10' }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
