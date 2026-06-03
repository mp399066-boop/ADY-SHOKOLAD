'use client';

// Internal team chat widget for the Kitchen View. Floating button + side panel.
// Reads/sends via /api/team-messages (auth-gated, service_role server-side only).
// Transport: simple polling every 12s while the kitchen view is open — the
// team_messages table is new and Realtime replication isn't configured for it,
// so polling is the safe/simple choice here.

import { useCallback, useEffect, useRef, useState } from 'react';
import { C } from './theme';

interface TeamMessage {
  id: string;
  sender_name: string | null;
  message: string;
  created_at: string;
}

const POLL_MS = 12_000;
const MAX_LEN = 500;
const MUTE_KEY = 'team_chat_muted';
const SEEN_KEY = 'team_chat_last_seen_id';

function lsGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, value); } catch {}
}

// Soft single-tone chime. Fails silently if autoplay is blocked.
function playChime(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 587.33; // D5 — soft, single note
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  } catch {
    // autoplay blocked — keep the visual badge, no sound
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function KitchenTeamChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const openRef = useRef(open);
  const mutedRef = useRef(false);
  const lastSeenId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initialised = useRef(false);

  openRef.current = open;

  // Hydrate prefs after mount
  useEffect(() => {
    const m = lsGet(MUTE_KEY) === '1';
    mutedRef.current = m;
    setMuted(m);
    lastSeenId.current = lsGet(SEEN_KEY);
  }, []);

  const markAllSeen = useCallback((msgs: TeamMessage[]) => {
    if (msgs.length === 0) return;
    const latest = msgs[msgs.length - 1].id;
    lastSeenId.current = latest;
    lsSet(SEEN_KEY, latest);
    setUnread(0);
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/team-messages', { cache: 'no-store' });
      if (!res.ok) throw new Error('load');
      const json = await res.json();
      const next: TeamMessage[] = json.messages ?? [];
      setError(null);

      setMessages(prev => {
        // Detect new arrivals (ids not present before) on subsequent polls
        if (initialised.current) {
          const prevIds = new Set(prev.map(m => m.id));
          const fresh = next.filter(m => !prevIds.has(m.id));
          if (fresh.length > 0) {
            if (openRef.current) {
              markAllSeen(next);
            } else {
              // Count unread relative to last seen, play soft chime once
              const seen = lastSeenId.current;
              const seenIdx = seen ? next.findIndex(m => m.id === seen) : -1;
              setUnread(seenIdx >= 0 ? next.length - seenIdx - 1 : next.length);
              if (!mutedRef.current) playChime();
            }
          }
        }
        return next;
      });

      // First load: if panel open, mark seen; else compute unread silently
      if (!initialised.current) {
        initialised.current = true;
        if (openRef.current) {
          markAllSeen(next);
        } else {
          const seen = lastSeenId.current;
          const seenIdx = seen ? next.findIndex(m => m.id === seen) : -1;
          setUnread(seenIdx >= 0 ? next.length - seenIdx - 1 : 0);
        }
      }
    } catch {
      setError('שגיאה בטעינת ההודעות');
    } finally {
      setLoading(false);
    }
  }, [markAllSeen]);

  // Poll while mounted
  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(id);
  }, [fetchMessages]);

  // When panel opens: clear unread + scroll to bottom
  useEffect(() => {
    if (!open) return;
    markAllSeen(messages);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep scrolled to bottom on new messages while open
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.slice(0, MAX_LEN) }),
      });
      if (!res.ok) throw new Error('send');
      const json = await res.json();
      const msg: TeamMessage = json.message;
      setDraft('');
      setMessages(prev => {
        const next = [...prev.filter(m => m.id !== msg.id), msg];
        markAllSeen(next);
        return next;
      });
    } catch {
      setError('שליחת ההודעה נכשלה');
    } finally {
      setSending(false);
    }
  }, [draft, sending, markAllSeen]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    lsSet(MUTE_KEY, next ? '1' : '0');
  }, []);

  return (
    <div dir="rtl">
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg transition-transform hover:scale-[1.03]"
          style={{ backgroundColor: C.brand, color: '#FFFDF9' }}
        >
          <span className="text-[12.5px] font-bold">הודעות צוות</span>
          {unread > 0 && (
            <span
              className="flex items-center justify-center text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1"
              style={{ backgroundColor: C.gold, color: C.espresso }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-5 left-5 z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 'min(360px, calc(100vw - 2.5rem))',
            height: 'min(520px, calc(100vh - 6rem))',
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
          }}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between px-3.5 py-3"
            style={{ backgroundColor: C.brandSoft, borderBottom: `1px solid ${C.border}` }}
          >
            <div>
              <h3 className="text-[13.5px] font-bold" style={{ color: C.brand }}>הודעות צוות</h3>
              <p className="text-[10.5px] mt-0.5" style={{ color: C.textSoft }}>כתבי הודעה לעדי או לצוות</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="text-[10.5px] font-semibold rounded-md px-2 py-1 transition-opacity hover:opacity-70"
                style={{ color: muted ? C.red : C.textSoft, backgroundColor: C.card, border: `1px solid ${C.border}` }}
                title="השתק צליל"
              >
                {muted ? 'מושתק' : 'השתק צליל'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[15px] leading-none rounded-md px-2 py-1 transition-opacity hover:opacity-70"
                style={{ color: C.textSoft }}
                aria-label="סגור"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">
            {loading && messages.length === 0 ? (
              <p className="text-center text-[11.5px] py-6" style={{ color: C.textMuted }}>טוען הודעות…</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-[11.5px] py-6" style={{ color: C.textMuted }}>אין הודעות עדיין</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className="rounded-xl px-3 py-2" style={{ backgroundColor: C.brandSoft }}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-bold" style={{ color: C.brand }}>
                      {m.sender_name || 'צוות'}
                    </span>
                    <span className="text-[9.5px]" style={{ color: C.textMuted }}>
                      {formatTime(m.created_at)}
                    </span>
                  </div>
                  <p className="text-[12px] whitespace-pre-wrap break-words" style={{ color: C.text }}>
                    {m.message}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 space-y-2" style={{ borderTop: `1px solid ${C.border}` }}>
            {error && (
              <p className="text-[10.5px]" style={{ color: C.red }}>{error}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value.slice(0, MAX_LEN))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="כתבי הודעה…"
                rows={1}
                className="flex-1 resize-none rounded-lg px-2.5 py-2 text-[12px] outline-none"
                style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.text, maxHeight: '80px' }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || sending}
                className="rounded-lg px-3.5 py-2 text-[12px] font-bold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: C.brand, color: '#FFFDF9' }}
              >
                {sending ? '…' : 'שליחה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
