import Link from 'next/link';

interface ActionBtnProps {
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export function ActionBtn({ title, icon, href, onClick, variant = 'default', disabled }: ActionBtnProps) {
  const cls =
    variant === 'danger'
      ? 'w-7 h-7 rounded-lg flex items-center justify-center text-[#9A9A9A] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40'
      : 'w-7 h-7 rounded-lg flex items-center justify-center text-[#9A9A9A] transition-colors hover:bg-[#F2EBE1] hover:text-[#8B5E3C] disabled:opacity-40';

  if (href) {
    return (
      <Link href={href} title={title} className={cls} onClick={e => e.stopPropagation()}>
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={title}
      className={cls}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick?.(e); }}
    >
      {icon}
    </button>
  );
}
