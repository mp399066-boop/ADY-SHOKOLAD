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
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#4A4A4A' }}>
          {label}
          {required && <span className="mr-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2.5 text-sm rounded-xl border bg-white transition-all duration-200',
          error ? 'border-red-300 focus:border-red-400' : 'border-[#E7E1D8] focus:border-[#C6A77D]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:ring-red-100' : 'focus:ring-[#C6A77D]/15',
          'placeholder:text-[#BCBCBC]',
          className,
        )}
        style={{ color: '#2B2B2B' }}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs" style={{ color: '#7A7A7A' }}>{hint}</p>}
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
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#4A4A4A' }}>
          {label}
          {required && <span className="mr-0.5 text-red-500">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2.5 text-sm rounded-xl border bg-white transition-all duration-200 resize-y',
          error ? 'border-red-400 focus:border-red-400' : 'border-[#E7E1D8] focus:border-[#C6A77D]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:ring-red-100' : 'focus:ring-[#C6A77D]/15',
          'placeholder:text-[#BCBCBC]',
          className,
        )}
        style={{ color: '#2B2B2B' }}
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
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#4A4A4A' }}>
          {label}
          {required && <span className="mr-0.5 text-red-500">*</span>}
        </label>
      )}
      <select
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2.5 text-sm rounded-xl border bg-white transition-all duration-200',
          error ? 'border-red-300 focus:border-red-400' : 'border-[#E7E1D8] focus:border-[#C6A77D]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:ring-red-100' : 'focus:ring-[#C6A77D]/15',
          className,
        )}
        style={{ color: '#2B2B2B' }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
