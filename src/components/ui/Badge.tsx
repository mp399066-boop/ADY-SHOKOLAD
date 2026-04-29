import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Badge({ children, className, style }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        className
      )}
      style={{
        backgroundColor: '#F4F0EA',
        color: '#5C3A1E',
        border: '1px solid #E7E1D8',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
