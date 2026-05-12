'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AssistantResponse, Block, ClarifyOption, ConversationContext, Filters, ListItem, OrderSummary, ParsedIntent, Range, Tone } from '@/lib/assistant/types';
import { CONTEXT_TTL_MS } from '@/lib/assistant/types';

const STORAGE_KEY  = 'assistant-history-v1';
// Bumped from -v1 to -v2 because the stored shape changed from a bare
// ParsedIntent to a {ctx, savedAt} envelope. v1 readers naturally fall
// through to "no context" — fine, just one missed follow-up.
const CONTEXT_KEY  = 'assistant-context-v2';

// Pull the still-relevant pieces out of an intent so a follow-up can
// reuse them ("ותשלחי במייל" needs the previous range/filters).
function deriveContextFromIntent(intent: ParsedIntent): ConversationContext {
  const ctx: ConversationContext = { lastIntent: intent };
  // Range + filters live on different intent variants — pick where present.
  if ('range' in intent)   ctx.lastRange   = intent.range as Range;
  if ('filters' in intent) ctx.lastFilters = intent.filters as Filters;
  // Coarse action label for "אותו דבר" replays.
  switch (intent.type) {
    case 'count_orders':              ctx.lastAction = 'count'; break;
    case 'find_orders':               ctx.lastAction = 'find'; break;
    case 'list_low_stock':
    case 'list_petit_four_types':     ctx.lastAction = 'list'; break;
    case 'stock_query':               ctx.lastAction = 'stock_lookup'; break;
    case 'download_orders_report':    ctx.lastAction = 'report_download'; break;
    case 'send_orders_report':        ctx.lastAction = 'report_send'; break;
    case 'request_report_action':     ctx.lastAction = 'report_choose'; break;
    default: /* no action label */
  }
  return ctx;
}
const MAX_RECENT       = 3;

// Categorized quick-actions for the empty state
const QUICK_ACTIONS: { title: string; chips: string[] }[] = [
  { title: 'דוחות',   chips: ['דוח הזמנות להיום', 'דוח הזמנות למחר'] },
  { title: 'הזמנות',  chips: ['איזה הזמנות יש היום?', 'הזמנות דחופות להיום', 'מה לא שולם?'] },
  { title: 'מלאי',    chips: ['מה במלאי נמוך?', 'איזה סוגי פטיפורים קיימים?'] },
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
  // Short conversation memory. Carries the previous intent + derived
  // filters/range/action label so the parser can resolve follow-ups like
  // "רק הדחופות" / "ותשלחי במייל" / "אותו דבר למחר". Expires after
  // CONTEXT_TTL_MS — beyond that we drop it before sending so a long-idle
  // tab doesn't apply stale follow-up logic to a fresh question.
  const contextRef = useRef<{ ctx: ConversationContext; savedAt: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
      const c = sessionStorage.getItem(CONTEXT_KEY);
      if (c) {
        const env = JSON.parse(c) as { ctx: ConversationContext; savedAt: number };
        if (env && typeof env.savedAt === 'number' && Date.now() - env.savedAt < CONTEXT_TTL_MS) {
          contextRef.current = env;
        } else {
          sessionStorage.removeItem(CONTEXT_KEY);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Recent user queries — derived from message history (no separate storage)
  const recent = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < MAX_RECENT; i--) {
      const m = messages[i];
      if (m.role === 'user' && !seen.has(m.text)) {
        seen.add(m.text);
        out.push(m.text);
      }
    }
    return out;
  })();

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
      // Drop expired context BEFORE sending so the server doesn't apply stale
      // follow-up logic. Window is CONTEXT_TTL_MS (5 min).
      const env = contextRef.current;
      const fresh = env && Date.now() - env.savedAt < CONTEXT_TTL_MS ? env.ctx : undefined;

      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, context: fresh }),
      });
      const json = (await res.json()) as AssistantResponse;
      // Update memory only when we got a real answer with an intent.
      if (json.kind === 'answer' && json.intent) {
        const ctx = deriveContextFromIntent(json.intent);
        const savedAt = Date.now();
        contextRef.current = { ctx, savedAt };
        try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ ctx, savedAt })); } catch { /* ignore */ }
      }
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
    contextRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(CONTEXT_KEY);
    } catch { /* ignore */ }
  };

  return (
    <>
      {/* Floating button — bottom-left. Lifted above the screen edge so it
          doesn't sit on top of page-level CTAs ("אישור הזמנה" etc) that
          live at the bottom of forms. 96px clears the typical button row
          plus a comfortable safe-area margin on mobile. */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="עוזרת מערכת"
        className="fixed z-40"
        style={{
          bottom: '96px',
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
              {messages.length === 0 && <EmptyState onPick={send} recent={recent} />}
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

function EmptyState({ onPick, recent }: { onPick: (t: string) => void; recent: string[] }) {
  return (
    <div style={{ paddingTop: '8px' }}>
      <div style={{ fontSize: '13px', color: '#8A7664', textAlign: 'center', marginBottom: '14px' }}>
        על מה תרצי לשאול?
      </div>

      {recent.length > 0 && (
        <Section title="חיפושים אחרונים">
          {recent.map(r => (
            <Chip key={r} onClick={() => onPick(r)} muted>
              <span style={{ color: '#B0A090', fontSize: '11px', marginLeft: '4px' }}>↻</span> {r}
            </Chip>
          ))}
        </Section>
      )}

      {QUICK_ACTIONS.map(group => (
        <Section key={group.title} title={group.title}>
          {group.chips.map(s => (
            <Chip key={s} onClick={() => onPick(s)}>{s}</Chip>
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#8E7D6A', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {children}
      </div>
    </div>
  );
}

function Chip({ onClick, children, muted = false }: { onClick: () => void; children: React.ReactNode; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        fontSize: '12px',
        borderRadius: '8px',
        border: '1px solid #E8DED2',
        backgroundColor: muted ? '#FAF7F0' : '#FFFFFF',
        color: '#5C4A38',
        cursor: 'pointer',
        textAlign: 'right',
        direction: 'rtl',
        fontFamily: 'inherit',
        transition: 'background-color 100ms',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FBF3E8'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = muted ? '#FAF7F0' : '#FFFFFF'; }}
    >
      {children}
    </button>
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
      {response.blocks.map((b, i) => <BlockView key={i} block={b} onOpenOrder={onOpenOrder} onPick={onPick} />)}
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

function BlockView({ block, onOpenOrder, onPick }: { block: Block; onOpenOrder: (id: string) => void; onPick: (t: string) => void }) {
  if (block.type === 'text') {
    return <div style={{ fontSize: '13px', color: '#2B1A10', lineHeight: 1.5, padding: '4px 0' }}>{block.text}</div>;
  }

  if (block.type === 'insight') {
    const tone = block.tone || 'neutral';
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 11px',
          fontSize: '12px',
          backgroundColor: TONE_BG[tone],
          color: TONE_FG[tone],
          borderRadius: '8px',
          marginTop: '6px',
          fontWeight: 500,
        }}
      >
        {block.emoji && <span style={{ fontSize: '13px' }}>{block.emoji}</span>}
        <span>{block.text}</span>
      </div>
    );
  }

  if (block.type === 'suggestions') {
    return (
      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #F0EAE0' }}>
        {block.title && (
          <div style={{ fontSize: '10px', color: '#B0A090', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '6px' }}>
            {block.title}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {block.items.map(opt => (
            <button
              key={opt.text}
              onClick={() => onPick(opt.text)}
              style={{
                padding: '5px 10px',
                fontSize: '11px',
                borderRadius: '999px',
                border: '1px solid #E8DED2',
                backgroundColor: '#FAF7F0',
                color: '#5C4A38',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background-color 100ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FBF3E8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FAF7F0'; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
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

  if (block.type === 'confirm_send_report') {
    return <ConfirmSendReportCard block={block} />;
  }

  if (block.type === 'report_preview') {
    return <ReportPreviewCard block={block} />;
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

// Confirmation card for sending the orders report by email. Renders the
// recipient address + range + active filter summary, plus two buttons. The
// email is sent ONLY when the user clicks אשרי שליחה — the assistant
// action that produced this block did not call the send endpoint.
function ConfirmSendReportCard({ block }: { block: Extract<Block, { type: 'confirm_send_report' }> }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'cancelled' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/reports/orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block.payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשליחת הדוח');
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <div style={{ marginTop: '6px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#E8F5EE', border: '1px solid #B7DBC4', fontSize: '13px', color: '#1F6B43' }}>
        ✓ הדוח נשלח ל-<span dir="ltr">{block.recipientEmail}</span>
      </div>
    );
  }

  if (state === 'cancelled') {
    return (
      <div style={{ marginTop: '6px', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#F2EBDD', fontSize: '12px', color: '#6B4A2D' }}>
        השליחה בוטלה — לא נשלח דבר.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: '6px',
        padding: '14px 16px',
        borderRadius: '12px',
        backgroundColor: '#FFFDF8',
        border: '1px solid #E8DED2',
        boxShadow: '0 1px 4px rgba(58,42,26,0.04)',
      }}
    >
      <div style={{ fontSize: '11px', color: '#9B7A5A', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.04em' }}>
        אישור שליחה
      </div>
      <div style={{ fontSize: '13px', color: '#2B1A10', marginBottom: '4px' }}>
        לשלוח דוח הזמנות {block.filtersLabel ? `${block.filtersLabel} ` : ''}{block.rangeLabel} לכתובת:
      </div>
      <div dir="ltr" style={{ fontSize: '13px', fontWeight: 700, color: '#8B5E34', marginBottom: '12px', textAlign: 'right' }}>
        {block.recipientEmail}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={handleConfirm}
          disabled={state === 'sending'}
          style={{
            flex: 1,
            padding: '9px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '8px',
            backgroundColor: state === 'sending' ? '#D9CDBC' : '#8B5E34',
            color: '#FFFFFF',
            border: 'none',
            cursor: state === 'sending' ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {state === 'sending' ? '...שולח' : '✓ אשרי שליחה'}
        </button>
        <button
          onClick={() => setState('cancelled')}
          disabled={state === 'sending'}
          style={{
            padding: '9px 14px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            color: '#6B4A2D',
            border: '1px solid #DDD0BC',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ביטול
        </button>
      </div>
      {error && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#A03C2C' }}>{error}</div>
      )}
    </div>
  );
}

// Inline preview card used inside the assistant chat. Replaces the older
// download_button + confirm_send_report blocks for report flows — both
// download and send-by-email decisions are made INSIDE this card after the
// user has seen the actual numbers + first 5 orders. No DB write, no email,
// no file download happens until the user clicks one of the CTAs here.
type PreviewBlock = Extract<Block, { type: 'report_preview' }>;
type PreviewData = {
  summary: {
    total: number;
    urgent: number;
    delivery: number;
    pickup: number;
    unpaid: number;
    rangeLabel: string;
    startDate: string;
    endDate: string;
    totalAmount: number;
    sampleSize: number;
    truncated: boolean;
  };
  sample: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    deliveryDate: string | null;
    deliveryTime: string | null;
    deliveryType: string | null;
    paymentStatus: string | null;
    urgent: boolean;
    total: number;
  }>;
};

function ReportPreviewCard({ block }: { block: PreviewBlock }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'downloading' | 'sending' | 'sent' | 'cancelled'>('loading');
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState(block.recipientEmail ?? '');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reports/orders/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(block.query),
    })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json.error) { setError(json.error); setPhase('error'); return; }
        setData({ summary: json.summary, sample: json.sample });
        setPhase('ready');
      })
      .catch(() => { if (!cancelled) { setError('שגיאה בטעינת תצוגה'); setPhase('error'); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDownload = async () => {
    setPhase('downloading');
    setError(null);
    try {
      const res = await fetch('/api/reports/orders/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(block.query),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'שגיאה בהורדה');
      }
      const filename = res.headers.get('X-Report-Filename') || 'orders-report.html';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPhase('ready'); // back to ready so user can also send if they want
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
      setPhase('error');
    }
  };

  const onSend = async () => {
    const to = emailInput.trim();
    if (!to) { setError('יש להזין כתובת מייל'); return; }
    setPhase('sending');
    setError(null);
    try {
      const res = await fetch('/api/reports/orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...block.query, recipientEmail: to }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'שגיאה בשליחה');
      setPhase('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
      setPhase('error');
    }
  };

  if (phase === 'sent') {
    return (
      <div style={{ marginTop: '6px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#E8F5EE', border: '1px solid #B7DBC4', fontSize: '13px', color: '#1F6B43' }}>
        ✓ הדוח נשלח ל-<span dir="ltr">{emailInput.trim()}</span>
      </div>
    );
  }
  if (phase === 'cancelled') {
    return (
      <div style={{ marginTop: '6px', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#F2EBDD', fontSize: '12px', color: '#6B4A2D' }}>
        בוטל — לא נשלח דבר.
      </div>
    );
  }
  if (phase === 'loading') {
    return (
      <div style={{ marginTop: '6px', padding: '14px', borderRadius: '12px', backgroundColor: '#FFFDF8', border: '1px solid #E8DED2', fontSize: '12px', color: '#9B7A5A', textAlign: 'center' }}>
        טוען תצוגה מוקדמת…
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: '6px', padding: '14px 16px',
        borderRadius: '12px', backgroundColor: '#FFFDF8',
        border: '1px solid #E8DED2', boxShadow: '0 1px 4px rgba(58,42,26,0.04)',
      }}
    >
      <div style={{ fontSize: '11px', color: '#9B7A5A', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.04em' }}>
        תצוגה מוקדמת — דוח הזמנות
      </div>
      <div style={{ fontSize: '13px', color: '#2B1A10', marginBottom: '10px' }}>
        {block.filtersLabel ? `${block.filtersLabel} ` : ''}{block.rangeLabel}
      </div>

      {data && (
        <>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
            <Stat label="סה״כ הזמנות" value={String(data.summary.total)} />
            <Stat label="סכום כולל" value={`₪${data.summary.totalAmount.toFixed(2)}`} />
            {data.summary.urgent > 0 && <Stat label="דחופות" value={String(data.summary.urgent)} tone="warn" />}
            {data.summary.unpaid > 0 && <Stat label="לא שולמו" value={String(data.summary.unpaid)} tone="warn" />}
            {data.summary.delivery > 0 && <Stat label="משלוחים" value={String(data.summary.delivery)} />}
            {data.summary.pickup > 0 && <Stat label="איסוף" value={String(data.summary.pickup)} />}
          </div>

          {/* Sample orders */}
          {data.summary.total === 0 ? (
            <div style={{ padding: '14px', textAlign: 'center', backgroundColor: '#FAF7F0', borderRadius: '8px', fontSize: '12px', color: '#9B7A5A', marginBottom: '10px' }}>
              אין הזמנות בטווח הזה — דוח יישלח/יורד ריק.
            </div>
          ) : (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', color: '#9B7A5A', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {data.summary.truncated ? `5 הראשונות מתוך ${data.summary.total}` : `כל ההזמנות בדוח`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {data.sample.map(o => (
                  <div key={o.id} style={{ padding: '7px 10px', backgroundColor: o.urgent ? '#FBE9E7' : '#FAF7F0', borderRadius: '6px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#2B1A10' }}>{o.customerName}</span>
                      <span style={{ fontWeight: 700, color: '#8B5E34', direction: 'ltr' }}>₪{o.total.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#9B7A5A', marginTop: '2px' }}>
                      {o.orderNumber}
                      {o.deliveryDate && ` · ${o.deliveryDate}${o.deliveryTime ? ' ' + o.deliveryTime : ''}`}
                      {o.deliveryType && ` · ${o.deliveryType}`}
                      {o.paymentStatus && ` · ${o.paymentStatus}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email field — shown when send is the preferred action OR when an
              email already came down from the action (DAILY_ORDERS_REPORT_EMAIL). */}
          {(block.preferredAction === 'send' || block.recipientEmail) && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: '#9B7A5A', display: 'block', marginBottom: '3px' }}>נשלח אל</label>
              <input
                type="email"
                dir="ltr"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="example@domain.com"
                style={{
                  width: '100%', padding: '7px 10px', fontSize: '12px',
                  borderRadius: '6px', border: '1px solid #DDD0BC',
                  backgroundColor: '#FFFFFF', color: '#2B1A10',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              />
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={onDownload}
              disabled={phase === 'downloading' || phase === 'sending'}
              style={{
                flex: '1 1 auto', minWidth: '120px',
                padding: '9px 12px', fontSize: '12px', fontWeight: 600,
                borderRadius: '8px',
                backgroundColor: block.preferredAction === 'download' ? '#8B5E34' : '#FFFFFF',
                color: block.preferredAction === 'download' ? '#FFFFFF' : '#6B4A2D',
                border: block.preferredAction === 'download' ? 'none' : '1px solid #DDD0BC',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {phase === 'downloading' ? '...מוריד' : '⬇ הורידי דוח'}
            </button>
            <button
              onClick={onSend}
              disabled={phase === 'downloading' || phase === 'sending' || !emailInput.trim()}
              style={{
                flex: '1 1 auto', minWidth: '120px',
                padding: '9px 12px', fontSize: '12px', fontWeight: 600,
                borderRadius: '8px',
                backgroundColor: block.preferredAction === 'send' ? '#8B5E34' : '#FFFFFF',
                color: block.preferredAction === 'send' ? '#FFFFFF' : '#6B4A2D',
                border: block.preferredAction === 'send' ? 'none' : '1px solid #DDD0BC',
                cursor: !emailInput.trim() ? 'not-allowed' : 'pointer',
                opacity: !emailInput.trim() ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {phase === 'sending' ? '...שולח' : '✉ שלחי במייל'}
            </button>
            <button
              onClick={() => setPhase('cancelled')}
              disabled={phase === 'downloading' || phase === 'sending'}
              style={{
                padding: '9px 14px', fontSize: '12px', fontWeight: 500,
                borderRadius: '8px', backgroundColor: '#FFFFFF',
                color: '#6B4A2D', border: '1px solid #DDD0BC',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ביטול
            </button>
          </div>
        </>
      )}

      {error && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#A03C2C' }}>{error}</div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div style={{
      padding: '6px 10px', borderRadius: '6px',
      backgroundColor: tone === 'warn' ? '#FFF8E1' : '#FAF7F0',
    }}>
      <div style={{ fontSize: '10px', color: '#9B7A5A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: tone === 'warn' ? '#92400E' : '#2B1A10', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
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
