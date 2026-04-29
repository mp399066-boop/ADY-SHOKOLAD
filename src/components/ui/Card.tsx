import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className, style }: CardProps) {
  return (
    <div
      className={cn('bg-white rounded-xl p-5 premium-card', className)}
      style={{
        border: '1px solid #EAE0D4',
        boxShadow: '0 1px 6px rgba(58,42,26,0.05)',
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
      className={cn('text-sm font-medium', className)}
      style={{ color: '#3A2A1A', letterSpacing: '0.2px' }}
    >
      {children}
    </h2>
  );
}
