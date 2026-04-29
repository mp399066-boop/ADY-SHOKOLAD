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
      ? 'w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40'
      : 'w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-40';

  const style =
    variant === 'danger'
      ? { color: '#C0AFA8' }
      : { color: '#C0AFA8' };

  const hoverEnter = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (variant === 'danger') {
      el.style.backgroundColor = '#F5EAE8';
      el.style.color = '#A0362C';
    } else {
      el.style.backgroundColor = '#F5EFE8';
      el.style.color = '#8B5E34';
    }
  };
  const hoverLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.color = '#C0AFA8';
  };

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        className={cls}
        style={style}
        onClick={e => e.stopPropagation()}
        onMouseEnter={hoverEnter}
        onMouseLeave={hoverLeave}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={title}
      className={cls}
      style={style}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick?.(e); }}
      onMouseEnter={hoverEnter}
      onMouseLeave={hoverLeave}
    >
      {icon}
    </button>
  );
}
