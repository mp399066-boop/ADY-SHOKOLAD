'use client';

import type { OrderRecipient } from '@/types/database';
// ─── Small field helpers ───────────────────────────────────────────────────────

/**
 * "Who is this line for?" — shown in the item editor only while the order
 * actually has recipients. Keeping the assignment editable here is what stops
 * a routine item edit from quietly detaching every line from its recipient.
 */
export function EditRecipientSelect({ recipients, value, onChange }: {
  recipients: OrderRecipient[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (recipients.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-medium flex-shrink-0" style={{ color: '#6B4A2D' }}>עבור:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none"
        style={{ borderColor: value ? '#DDD0BC' : '#FBBF24', color: '#2B1A10' }}
      >
        <option value="">— כל ההזמנה —</option>
        {recipients.map((r, i) => (
          <option key={r.id} value={r.id}>{i + 1}. {r.שם_נמען}</option>
        ))}
      </select>
    </div>
  );
}

export function FieldInput({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
      />
    </div>
  );
}

export function FieldSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
      >
        {children}
      </select>
    </div>
  );
}

// ─── Detail-page UI helpers (presentation only — no business logic) ──────────

// Tiny inline icon set — keeps bundle slim and matches the brand stroke weight.
export function Icon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const props = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'user':     return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case 'phone':    return <svg {...props}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>;
    case 'mail':     return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case 'truck':    return <svg {...props}><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
    case 'pin':      return <svg {...props}><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'clock':    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'note':     return <svg {...props}><path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5z"/><path d="M16 4v4h4M9 12h6M9 16h4"/></svg>;
    case 'gift':     return <svg {...props}><path d="M3 12h18v9H3z"/><path d="M12 7v14M3 7h18v5H3z"/><path d="M12 7c-2 0-4-1-4-3s2-2 3-1 1 4 1 4zM12 7c2 0 4-1 4-3s-2-2-3-1-1 4-1 4z"/></svg>;
    case 'edit':     return <svg {...props}><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 5l4 4"/></svg>;
    case 'chevron':  return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case 'check':    return <svg {...props}><path d="m5 13 4 4 10-10"/></svg>;
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow':    return <svg {...props}><path d="m15 6-6 6 6 6"/></svg>;
    case 'download': return <svg {...props}><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>;
    default:         return null;
  }
}

// One field of an info card: tiny muted icon, tiny muted label, prominent value.
export function InfoField({
  icon, label, children,
}: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="flex-shrink-0 mt-0.5" style={{ color: '#9B7A5A' }}><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: '#9B7A5A' }}>{label}</p>
        <div className="text-sm leading-snug" style={{ color: '#2B1A10' }}>{children}</div>
      </div>
    </div>
  );
}

// Vertical timeline of order statuses — current step is filled, prior steps are
// muted-filled (done), upcoming are hollow. Click any step to update.
export function StatusTimeline({
  statuses, current, disabled, onPick,
}: {
  statuses: string[]; current: string; disabled: boolean; onPick: (s: string) => void;
}) {
  const currentIdx = statuses.indexOf(current);
  return (
    <ol className="relative" dir="rtl">
      {statuses.map((s, i) => {
        const isDone = currentIdx >= 0 && i < currentIdx;
        const isCurrent = i === currentIdx;
        const isLast = i === statuses.length - 1;
        const dotBg = isCurrent ? '#8B5E34' : isDone ? '#C7A46B' : '#FFFFFF';
        const dotBorder = isCurrent ? '#8B5E34' : isDone ? '#C7A46B' : '#DDD0BC';
        const labelColor = isCurrent ? '#2B1A10' : isDone ? '#6B4A2D' : '#9B7A5A';
        const lineColor = isDone ? '#C7A46B' : '#E8DED2';
        return (
          <li key={s} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute top-5 right-[9px] w-px"
                style={{ height: 'calc(100% - 12px)', background: lineColor }}
              />
            )}
            <span
              aria-hidden
              className="flex-shrink-0 w-5 h-5 rounded-full mt-0.5 transition-colors flex items-center justify-center"
              style={{ background: dotBg, border: `2px solid ${dotBorder}` }}
            >
              {isDone && <Icon name="check" className="w-3 h-3" />}
            </span>
            <button
              type="button"
              onClick={() => onPick(s)}
              disabled={disabled || isCurrent}
              className="flex-1 text-right text-sm font-medium px-2 py-1 -mx-2 rounded-md transition-colors hover:bg-stone-50 disabled:cursor-default disabled:hover:bg-transparent"
              style={{ color: labelColor, fontWeight: isCurrent ? 700 : 500 }}
            >
              {s}
              {isCurrent && (
                <span
                  className="mr-2 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: '#E8DED2', color: '#6B4A2D' }}
                >
                  עכשיו
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
