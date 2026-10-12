import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F5EBDD] ring-8 ring-[#FAF7F0]">
        <Inbox className="h-6 w-6 text-[#C9A46A]" strokeWidth={1.6} />
      </div>
      <h3 className="mb-1 text-[15px] font-semibold text-[#3A2A1A]">
        {title}
      </h3>
      {description && (
        <p className="mb-4 max-w-xs text-[13px] leading-relaxed text-[#8A7664]">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
