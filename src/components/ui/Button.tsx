import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium rounded-[10px] whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#C9A46A] ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 select-none';

const SIZES = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-10 px-4 text-[13.5px]',
  lg: 'h-11 px-5 text-sm',
};

const VARIANTS = {
  primary:   'bg-[#8B5E34] text-white shadow-[0_1px_2px_rgba(139,94,52,0.25)] hover:bg-[#7A5020]',
  secondary: 'bg-[#C9A46A] text-white shadow-[0_1px_2px_rgba(201,164,106,0.25)] hover:bg-[#B8925A]',
  outline:   'bg-white border border-[#E8DED2] text-[#8B5E34] hover:bg-[#FAF7F0] hover:border-[#DDD0BC]',
  ghost:     'text-[#8B5E34] hover:bg-[#F5EBDD]',
  danger:    'bg-[#A0362C] text-white shadow-[0_1px_2px_rgba(160,54,44,0.25)] hover:bg-[#8A3228] focus-visible:ring-red-300',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
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
