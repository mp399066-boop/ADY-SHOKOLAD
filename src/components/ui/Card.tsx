import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className, style }: CardProps) {
  return (
    <div
      className={cn('bg-white rounded-2xl p-5 premium-card', className)}
      style={{
        border: '1px solid #E7E1D8',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn('text-sm font-semibold', className)}
      style={{ color: '#2B2B2B', letterSpacing: '0.3px' }}
    >
      {children}
    </h2>
  );
}
