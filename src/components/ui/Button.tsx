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
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl ' +
    'transition-all duration-200 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed select-none';

  const sizes = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-4.5 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
  };

  const variants: Record<string, { className: string; style?: React.CSSProperties }> = {
    primary: {
      className: 'text-white hover:opacity-88 active:opacity-80 focus-visible:ring-amber-400',
      style: { backgroundColor: '#8B5E34', boxShadow: '0 1px 6px rgba(139,94,52,0.18)' },
    },
    secondary: {
      className: 'hover:opacity-90 focus-visible:ring-amber-300',
      style: { backgroundColor: '#C7A46B', color: '#FFFFFF', boxShadow: '0 1px 4px rgba(199,164,107,0.18)' },
    },
    outline: {
      className: 'bg-white hover:bg-[#FAF7F2] active:bg-stone-100 focus-visible:ring-amber-300',
      style: { border: '1.5px solid #D8CCBA', color: '#8B5E34' },
    },
    ghost: {
      className: 'hover:bg-[#F5EFE6] active:bg-amber-100 focus-visible:ring-amber-300',
      style: { color: '#8B5E34' },
    },
    danger: {
      className: 'text-white hover:opacity-90 active:opacity-80 focus-visible:ring-red-400',
      style: { backgroundColor: '#BE3A2A', boxShadow: '0 1px 4px rgba(190,58,42,0.18)' },
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
        <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0 opacity-70" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
