import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };

  const variants: Record<string, { className: string; style?: React.CSSProperties }> = {
    primary: {
      className: 'text-white shadow-sm hover:brightness-110 focus-visible:ring-amber-400',
      style: { backgroundColor: '#8B5E34' },
    },
    secondary: {
      className: 'text-white shadow-sm hover:brightness-110 focus-visible:ring-amber-300',
      style: { backgroundColor: '#C7A46B' },
    },
    outline: {
      className: 'border bg-white hover:bg-amber-50 focus-visible:ring-amber-300',
      style: { borderColor: '#C7A46B', color: '#8B5E34' },
    },
    ghost: {
      className: 'hover:bg-amber-50 focus-visible:ring-amber-300',
      style: { color: '#8B5E34' },
    },
    danger: {
      className: 'bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-400',
    },
  };

  const v = variants[variant];

  return (
    <button
      className={cn(base, sizes[size], v.className, className)}
      style={v.style}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
