'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PUBLIC_C as C } from '@/components/public/public-colors';

// "I'd like a change" on the public quote page: the customer writes what to
// change and the owner updates the quote on the same link. Prices and items
// are never changed from here.
export default function RequestChange({ token, startOpen = false }: { token: string; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (message.trim().length < 2) { setError('נא לכתוב מה לשנות'); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_change', message: message.trim(), name: name.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'הבקשה לא נשלחה, אפשר לנסות שוב');
      setMessage('');
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הבקשה לא נשלחה, אפשר לנסות שוב');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full h-12 rounded-xl text-base font-medium border bg-white"
        style={{ borderColor: C.brand, color: C.brand }}
      >
        רוצה לשנות משהו בהצעה?
      </button>
    );
  }

  return (
    <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <label className="block text-sm" style={{ color: C.text }}>
        מה תרצו לשנות?
        <textarea
          value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={4}
          placeholder="למשל: להוסיף 20 טארטלטים, להחליף את הפטיפורים, לשנות את תאריך האספקה…"
          className="mt-1 w-full rounded-xl px-3 py-2 text-base border bg-white focus:outline-none"
          style={{ borderColor: C.border }}
        />
      </label>
      <label className="block text-sm" style={{ color: C.text }}>
        שם (לא חובה)
        <input
          value={name} onChange={e => setName(e.target.value)} maxLength={120}
          className="mt-1 w-full h-11 rounded-xl px-3 text-base border bg-white focus:outline-none"
          style={{ borderColor: C.border }} autoComplete="name"
        />
      </label>
      {error && <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={send} disabled={sending}
          className="flex-1 h-12 rounded-xl text-base font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: C.brand }}
        >
          {sending ? 'שולח…' : 'שליחת בקשת שינוי'}
        </button>
        {!startOpen && (
          <button onClick={() => { setOpen(false); setError(null); }} disabled={sending}
            className="h-12 px-4 rounded-xl text-sm border bg-white" style={{ borderColor: C.border, color: C.soft }}>
            ביטול
          </button>
        )}
      </div>
      <p className="text-xs text-center" style={{ color: C.soft }}>
        נעדכן את ההצעה ונשלח לכם אותה שוב לאישור, באותו קישור.
      </p>
    </div>
  );
}
