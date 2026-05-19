'use client';

// Banner shown above CommandHeader when a new WooCommerce order arrives.
// Dismissed only by clicking the action button — no X, no auto-dismiss.
// Colors come exclusively from the existing design tokens (theme.ts).
// Pulse animation is a gentle shadow swell, not an aggressive flash.

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WebsiteOrderNotification } from '@/hooks/useNewWebsiteOrderNotifications';

// Mirror of theme.ts tokens — imported directly to avoid coupling this
// component to the dashboard-specific theme import path.
const T = {
  amberSoft: '#F4E3C9',
  gold:      '#C49A6C',
  espresso:  '#2F1B14',
  cocoa:     '#7B4A35',
  amber:     '#A8753D',
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1)  return 'עכשיו';
  if (mins === 1) return 'לפני דקה';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? 'לפני שעה' : `לפני ${hrs} שעות`;
}

interface Props {
  orders: WebsiteOrderNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function NewWebsiteOrderBanner({
  orders,
  onDismiss,
  onDismissAll,
  isMuted,
  onToggleMute,
}: Props) {
  const router = useRouter();

  if (orders.length === 0) return null;

  const isSingle = orders.length === 1;
  const single = isSingle ? orders[0] : null;
  const latest = orders[orders.length - 1];
  const recipientName = (single ?? latest).שם_מקבל;

  return (
    <>
      {/* Pulse keyframes — scoped so they don't leak */}
      <style>{`
        @keyframes wco-glow {
          0%, 100% { box-shadow: 0 2px 12px rgba(196,154,108,0.22); }
          50%       { box-shadow: 0 4px 22px rgba(196,154,108,0.48); }
        }
      `}</style>

      <div
        dir="rtl"
        role="alert"
        aria-live="assertive"
        className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-3"
        style={{
          backgroundColor: T.amberSoft,
          border: `1.5px solid ${T.gold}`,
          animation: 'wco-glow 2.2s ease-in-out infinite',
        }}
      >
        {/* Bell */}
        <span className="text-[18px] flex-shrink-0" aria-hidden>🔔</span>

        {/* Text */}
        <p className="flex-1 min-w-0 text-[13.5px] font-semibold" style={{ color: T.espresso }}>
          {isSingle ? (
            <>
              <span className="font-bold">הזמנה חדשה מהאתר!</span>
              {' '}
              <span style={{ color: T.cocoa }}>
                #{single!.מספר_הזמנה}
                {recipientName ? ` — ${recipientName}` : ''}
                {single!.created_at ? ` · ${timeAgo(single!.created_at)}` : ''}
              </span>
            </>
          ) : (
            <>
              <span className="font-bold">{orders.length} הזמנות חדשות מהאתר</span>
              {' '}
              <span style={{ color: T.cocoa }}>
                — האחרונה:{' '}
                {recipientName ? recipientName : `#${latest.מספר_הזמנה}`}
              </span>
            </>
          )}
        </p>

        {/* Primary action */}
        {isSingle ? (
          <button
            type="button"
            onClick={() => {
              onDismiss(single!.id);
              router.push(`/orders/${single!.id}`);
            }}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-[12px] font-bold transition-opacity hover:opacity-85 flex-shrink-0"
            style={{ backgroundColor: T.espresso, color: '#FFFFFF' }}
          >
            פתחי הזמנה ←
          </button>
        ) : (
          <Link
            href="/orders"
            onClick={onDismissAll}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-[12px] font-bold transition-opacity hover:opacity-85 flex-shrink-0"
            style={{ backgroundColor: T.espresso, color: '#FFFFFF' }}
          >
            ראי הכל ←
          </Link>
        )}

        {/* Mute / unmute */}
        <button
          type="button"
          onClick={onToggleMute}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[15px] transition-colors flex-shrink-0"
          style={{
            backgroundColor: isMuted ? T.espresso : 'rgba(47,27,20,0.09)',
            color: isMuted ? '#FFFFFF' : T.amber,
          }}
          title={isMuted ? 'בטל השתקת צלצול' : 'השתק צלצול'}
          aria-label={isMuted ? 'בטל השתקת צלצול' : 'השתק צלצול'}
        >
          {isMuted ? '🔇' : '🔔'}
        </button>
      </div>
    </>
  );
}
