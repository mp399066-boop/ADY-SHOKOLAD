'use client';

// Supabase Realtime hook — listens for INSERT events on הזמנות where
// מקור_ההזמנה starts with "WooCommerce". Only fires for orders whose
// created_at is after the current browser session started, so navigating
// to the dashboard mid-day does not re-announce old orders.
//
// Sound: Web Audio API two-tone chime. Respects autoplay policy —
// if AudioContext.resume() is blocked, the chime queues and plays on the
// next user pointer interaction. Muted state persists in sessionStorage.
//
// Requires Supabase Realtime to be enabled for the הזמנות table.
// Enable via: Supabase dashboard → Database → Replication → הזמנות ✓

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface WebsiteOrderNotification {
  id: string;
  מספר_הזמנה: string;
  שם_מקבל: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ssGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function ssSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(key, value); } catch {}
}

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(ssGet(key) || '[]') as string[]); } catch { return new Set(); }
}

function saveSet(key: string, set: Set<string>): void {
  ssSet(key, JSON.stringify(Array.from(set)));
}

function playChime(): void {
  // Two-tone sine chime: C5 (523 Hz) then E5 (659 Hz), 0.22 s apart.
  // Gain envelope: short fade-in → exponential decay. Total duration ~0.8 s.
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const t = ctx.currentTime;
  [[523.25, 0], [659.25, 0.22]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + delay);
    gain.gain.linearRampToValueAtTime(0.28, t + delay + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.75);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.8);
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useNewWebsiteOrderNotifications() {
  const [orders, setOrders] = useState<WebsiteOrderNotification[]>([]);
  const [isMuted, setIsMutedState] = useState(false);

  // Stable refs — don't cause re-renders
  const sessionStart = useRef(new Date().toISOString());
  const dismissed = useRef<Set<string>>(new Set());
  const pendingChime = useRef(false);
  const mutedRef = useRef(false);

  // Hydrate from sessionStorage after mount
  useEffect(() => {
    dismissed.current = loadSet('wco_dismissed');
    const m = ssGet('wco_muted') === '1';
    mutedRef.current = m;
    setIsMutedState(m);
  }, []);

  // Flush pending chime on next pointer interaction (handles autoplay block)
  useEffect(() => {
    function onPointer() {
      if (!pendingChime.current || mutedRef.current) return;
      pendingChime.current = false;
      try { playChime(); } catch {}
    }
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, []);

  const triggerChime = useCallback(() => {
    if (mutedRef.current) return;
    try {
      playChime();
    } catch {
      // AudioContext blocked by autoplay policy — queue for next interaction
      pendingChime.current = true;
    }
  }, []);

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('wco-new-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'הזמנות' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;

          // Filter: WooCommerce source only
          const source = String(row['מקור_ההזמנה'] ?? '');
          if (!source.startsWith('WooCommerce')) return;

          // Filter: untreated status only
          if (row['סטטוס_הזמנה'] !== 'חדשה') return;

          // Filter: created after this session started (skip historical orders)
          const createdAt = String(row['created_at'] ?? '');
          if (createdAt && createdAt < sessionStart.current) return;

          // Skip already dismissed
          const id = String(row['id']);
          if (dismissed.current.has(id)) return;

          const notification: WebsiteOrderNotification = {
            id,
            מספר_הזמנה: String(row['מספר_הזמנה'] ?? ''),
            שם_מקבל: row['שם_מקבל'] ? String(row['שם_מקבל']) : null,
            created_at: createdAt,
          };

          setOrders(prev => [...prev.filter(o => o.id !== id), notification]);
          triggerChime();
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [triggerChime]);

  const dismiss = useCallback((id: string) => {
    dismissed.current.add(id);
    saveSet('wco_dismissed', dismissed.current);
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setOrders(prev => {
      for (const o of prev) dismissed.current.add(o.id);
      saveSet('wco_dismissed', dismissed.current);
      return [];
    });
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    setIsMutedState(muted);
    ssSet('wco_muted', muted ? '1' : '0');
  }, []);

  return { orders, dismiss, dismissAll, isMuted, setMuted };
}
