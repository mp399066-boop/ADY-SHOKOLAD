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
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#8A7664' }}>
          {label}
          {required && <span className="mr-0.5" style={{ color: '#A0362C' }}>*</span>}
        </label>
      )}
      <input
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border bg-white transition-all duration-200',
          error ? 'border-[#D8BCB6]' : 'border-[#E8DED2]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:border-[#D8BCB6] focus:ring-[#D8BCB6]/15' : 'focus:border-[#C9A46A] focus:ring-[#C9A46A]/12',
          'placeholder:text-[#C0B4A8]',
          className,
        )}
        style={{ color: '#3A2A1A' }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: '#8A3228' }}>{error}</p>}
      {hint && !error && <p className="text-xs" style={{ color: '#B0A090' }}>{hint}</p>}
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
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#8A7664' }}>
          {label}
          {required && <span className="mr-0.5" style={{ color: '#A0362C' }}>*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border bg-white transition-all duration-200 resize-y',
          error ? 'border-[#D8BCB6]' : 'border-[#E8DED2]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:border-[#D8BCB6] focus:ring-[#D8BCB6]/15' : 'focus:border-[#C9A46A] focus:ring-[#C9A46A]/12',
          'placeholder:text-[#C0B4A8]',
          className,
        )}
        style={{ color: '#3A2A1A' }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: '#8A3228' }}>{error}</p>}
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
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: '#8A7664' }}>
          {label}
          {required && <span className="mr-0.5" style={{ color: '#A0362C' }}>*</span>}
        </label>
      )}
      <select
        id={inputId}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border bg-white transition-all duration-200',
          error ? 'border-[#D8BCB6]' : 'border-[#E8DED2]',
          'focus:outline-none focus:ring-2',
          error ? 'focus:border-[#D8BCB6] focus:ring-[#D8BCB6]/15' : 'focus:border-[#C9A46A] focus:ring-[#C9A46A]/12',
          className,
        )}
        style={{ color: '#3A2A1A' }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs" style={{ color: '#8A3228' }}>{error}</p>}
    </div>
  );
}
