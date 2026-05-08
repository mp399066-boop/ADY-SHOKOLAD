'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AssistantResponse, Block, ListItem, OrderSummary, Tone } from '@/lib/assistant/types';

const STORAGE_KEY = 'assistant-history-v1';

const SUGGESTIONS = [
  'כמה הזמנות יש היום?',
  'איזה הזמנות יש למחר?',
  'מה במלאי נמוך?',
  'הזמנות דחופות להיום',
];

type Message =
  | { role: 'user'; text: string; ts: number }
  | { role: 'assistant'; response: AssistantResponse; ts: number };

const TONE_BG: Record<Tone, string> = {
  good:    '#E5F2EA',
  warn:    '#FFF4E0',
  bad:     '#FBE9E7',
  neutral: '#FAF7F0',
};
const TONE_FG: Record<Tone, string> = {
  good:    '#1F6B3E',
  warn:    '#8A5A18',
  bad:     '#A03C2C',
  neutral: '#5C4A38',
};

export default function AssistantDrawer() {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending]   = useState(false);
  const [logoUrl, setLogoUrl]   = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Fetch brand logo from business_settings (same source as NavBar)
  useEffect(() => {
    const supabase = createClient();
    supabase.from('business_settings').select('logo_url').single()
      .then(({ data }: { data: { logo_url: string | null } | null }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url);
      });
  }, []);

  const openOrder = (id: string) => {
    setOpen(false);
    router.push(`/orders/${id}`);
  };

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setMessages(m => [...m, { role: 'user', text: trimmed, ts: Date.now() }]);
    setInput('');
    setPending(true);
    try {
      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const json = (await res.json()) as AssistantResponse;
      setMessages(m => [...m, { role: 'assistant', response: json, ts: Date.now() }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', response: { kind: 'error', message: 'שגיאת רשת' }, ts: Date.now() }]);
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };

  const clear = () => {
    setMessages([]);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  return (
    <>
      {/* Floating button — bottom-left, brand logo, premium 3D feel */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="עוזרת מערכת"
        className="fixed z-40"
        style={{
          bottom: '20px',
          left: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #C9A46A',
          padding: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(58,42,26,0.20), 0 2px 4px rgba(58,42,26,0.10), inset 0 1px 0 rgba(255,255,255,0.7)',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 22px rgba(58,42,26,0.26), 0 3px 6px rgba(58,42,26,0.12), inset 0 1px 0 rgba(255,255,255,0.7)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(58,42,26,0.20), 0 2px 4px rgba(58,42,26,0.10), inset 0 1px 0 rgba(255,255,255,0.7)';
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="עוזרת"
            style={{ width: '38px', height: '38px', objectFit: 'contain' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <img
            src="/logo.png"
            alt="עוזרת"
            style={{ width: '38px', height: '38px', objectFit: 'contain' }}
            onError={e => {
              const span = document.createElement('span');
              span.style.cssText = 'font-size:22px;font-weight:700;color:#8B5E34';
              span.textContent = 'ע';
              e.currentTarget.replaceWith(span);
            }}
          />
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}
          />
          <aside
            className="fixed top-0 z-50 flex flex-col"
            style={{
              right: 0,
              height: '100%',
              width: '380px',
              maxWidth: '100vw',
              backgroundColor: '#FFFFFF',
              borderLeft: '1px solid #EAE0D4',
              boxShadow: '-4px 0 18px rgba(58,42,26,0.10)',
              direction: 'rtl',
            }}
          >
            {/* Header */}
            <header
              className="flex items-center justify-between px-4"
              style={{ height: '54px', borderBottom: '1px solid #EAE0D4', backgroundColor: '#FDFAF5' }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#2B1A10' }}>עוזרת מערכת</div>
                <div style={{ fontSize: '11px', color: '#8E7D6A' }}>שאלי שאלה תפעולית</div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clear}
                    title="נקי שיחה"
                    style={{ fontSize: '11px', color: '#8A7664', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    נקי
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="סגור"
                  style={{ fontSize: '18px', color: '#8A7664', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: '14px', backgroundColor: '#F8F6F2' }}>
              {messages.length === 0 && <EmptyState onPick={send} />}
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: '12px' }}>
                  {m.role === 'user' ? <UserBubble text={m.text} /> : <AssistantReply response={m.response} onPick={send} onOpenOrder={openOrder} />}
                </div>
              ))}
              {pending && <PendingBubble />}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} style={{ padding: '12px', borderTop: '1px solid #EAE0D4', backgroundColor: '#FFFFFF' }}>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="לדוגמה: כמה הזמנות יש היום?"
                  disabled={pending}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    fontSize: '13px',
                    borderRadius: '10px',
                    border: '1px solid #E8DED2',
                    color: '#2B1A10',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  style={{
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    backgroundColor: pending || !input.trim() ? '#D9CDBC' : '#8B5E34',
                    color: '#FFFFFF',
                    border: 'none',
                    cursor: pending || !input.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  שלחי
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  );
}

// ───── Sub-components ──────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: '24px' }}>
      <div style={{ fontSize: '13px', color: '#8A7664', marginBottom: '14px' }}>
        שאלי על מלאי, הזמנות ומשלוחים
      </div>
      <div className="flex flex-col gap-2" style={{ maxWidth: '280px', margin: '0 auto' }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{
              padding: '9px 12px',
              fontSize: '12px',
              borderRadius: '999px',
              border: '1px solid #E8DED2',
              backgroundColor: '#FFFFFF',
              color: '#5C4A38',
              cursor: 'pointer',
              textAlign: 'right',
              direction: 'rtl',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div
        style={{
          display: 'inline-block',
          maxWidth: '85%',
          padding: '8px 12px',
          fontSize: '13px',
          backgroundColor: '#8B5E34',
          color: '#FFFFFF',
          borderRadius: '12px 12px 2px 12px',
          textAlign: 'right',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function PendingBubble() {
  return (
    <div style={{ fontSize: '12px', color: '#8A7664', padding: '8px 12px' }}>
      ...חושבת
    </div>
  );
}

function AssistantReply({ response, onPick, onOpenOrder }: { response: AssistantResponse; onPick: (t: string) => void; onOpenOrder: (id: string) => void }) {
  if (response.kind === 'error') {
    return <Card><div style={{ fontSize: '13px', color: '#A03C2C' }}>{response.message}</div></Card>;
  }
  if (response.kind === 'clarify') {
    return (
      <Card>
        <div style={{ fontSize: '13px', color: '#2B1A10', marginBottom: response.options ? '10px' : 0 }}>
          {response.message}
        </div>
        {response.options && (
          <div className="flex flex-wrap gap-1.5">
            {response.options.map(opt => (
              <button
                key={opt.text}
                onClick={() => onPick(opt.text)}
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  borderRadius: '999px',
                  border: '1px solid #E8DED2',
                  backgroundColor: '#FAF7F0',
                  color: '#5C4A38',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }
  return (
    <Card>
      {response.blocks.map((b, i) => <BlockView key={i} block={b} onOpenOrder={onOpenOrder} />)}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #EAE0D4',
        borderRadius: '12px 12px 12px 2px',
        padding: '12px',
        maxWidth: '92%',
        boxShadow: '0 1px 3px rgba(58,42,26,0.04)',
      }}
    >
      {children}
    </div>
  );
}

function BlockView({ block, onOpenOrder }: { block: Block; onOpenOrder: (id: string) => void }) {
  if (block.type === 'text') {
    return <div style={{ fontSize: '13px', color: '#2B1A10', lineHeight: 1.5, padding: '4px 0' }}>{block.text}</div>;
  }

  if (block.type === 'stat') {
    const tone = block.tone || 'neutral';
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderRadius: '8px',
          backgroundColor: TONE_BG[tone],
          marginBottom: '6px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#8E7D6A' }}>{block.label}</div>
          {block.sublabel && <div style={{ fontSize: '11px', color: TONE_FG[tone], marginTop: '1px' }}>{block.sublabel}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {block.emoji && <span style={{ fontSize: '15px' }}>{block.emoji}</span>}
          <span style={{ fontSize: '17px', fontWeight: 700, color: TONE_FG[tone] }}>{block.value}</span>
        </div>
      </div>
    );
  }

  if (block.type === 'list') {
    return (
      <div style={{ marginBottom: '6px' }}>
        {block.title && (
          <div style={{ fontSize: '11px', color: '#8E7D6A', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.04em' }}>
            {block.title}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {block.items.map((item, i) => <ListRow key={i} item={item} />)}
        </div>
      </div>
    );
  }

  if (block.type === 'download_button') {
    return <DownloadBlockButton block={block} />;
  }

  if (block.type === 'orders') {
    return (
      <div style={{ marginBottom: '6px' }}>
        {block.title && (
          <div style={{ fontSize: '11px', color: '#8E7D6A', marginBottom: '6px', fontWeight: 600, letterSpacing: '0.04em' }}>
            {block.title}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {block.orders.map(o => <OrderRow key={o.id} order={o} onClick={() => onOpenOrder(o.id)} />)}
        </div>
      </div>
    );
  }

  return null;
}

function ListRow({ item }: { item: ListItem }) {
  const tone = item.tone || 'neutral';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        backgroundColor: TONE_BG[tone],
        borderRadius: '6px',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {item.emoji && <span style={{ fontSize: '13px' }}>{item.emoji}</span>}
        <div>
          <div style={{ color: '#2B1A10', fontWeight: 500 }}>{item.label}</div>
          {item.sublabel && <div style={{ color: TONE_FG[tone], fontSize: '11px' }}>{item.sublabel}</div>}
        </div>
      </div>
      {item.value && (
        <div style={{ fontWeight: 700, color: TONE_FG[tone] }}>{item.value}</div>
      )}
    </div>
  );
}

function DownloadBlockButton({ block }: { block: Extract<Block, { type: 'download_button' }> }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(block.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block.payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'שגיאה בהורדה');
      }
      const filename = (block.filenameHeader && res.headers.get(block.filenameHeader))
        || 'orders-report.html';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        onClick={handleClick}
        disabled={downloading}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '10px',
          backgroundColor: downloading ? '#D9CDBC' : '#8B5E34',
          color: '#FFFFFF',
          border: 'none',
          cursor: downloading ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.02em',
          transition: 'background-color 120ms',
        }}
      >
        {downloading ? '...מוריד' : `⬇ ${block.label}`}
      </button>
      {error && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#A03C2C' }}>{error}</div>
      )}
    </div>
  );
}

function OrderRow({ order, onClick }: { order: OrderSummary; onClick: () => void }) {
  const paid     = order.paymentStatus === 'שולם';
  const pending  = order.paymentStatus === 'ממתין';
  const payEmoji = paid ? '✅' : pending ? '⏳' : '•';
  const baseBg   = order.urgent ? '#FBE9E7' : '#FAF7F0';
  const hoverBg  = order.urgent ? '#F8DDD7' : '#F2EBDD';
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = baseBg; }}
      style={{
        width: '100%',
        textAlign: 'right',
        padding: '9px 11px',
        backgroundColor: baseBg,
        border: order.urgent ? '1px solid #E8B5A8' : '1px solid #EDE0CE',
        borderRadius: '8px',
        fontSize: '12px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 120ms',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
        <div style={{ fontWeight: 700, color: '#2B1A10' }}>
          {order.urgent && <span style={{ color: '#A03C2C', marginLeft: '4px' }}>⚡</span>}
          #{order.number}
        </div>
        <div style={{ color: '#8A7664', fontSize: '11px' }}>{order.customer}</div>
      </div>
      <div style={{ display: 'flex', gap: '8px', color: '#5C4A38', fontSize: '11px' }}>
        {order.time && <span>🕐 {order.time}</span>}
        <span>{order.deliveryType === 'משלוח' ? '🚚' : '🏬'} {order.deliveryType}</span>
        <span>{payEmoji} {order.paymentStatus}</span>
      </div>
      <div style={{ marginTop: '2px', textAlign: 'left', fontSize: '11px', color: '#8B5E34', fontWeight: 600, letterSpacing: '0.02em' }}>
        פתחי הזמנה ←
      </div>
    </button>
  );
}
