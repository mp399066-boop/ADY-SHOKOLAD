'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PUBLIC_C as C } from '@/components/public/public-colors';

export default function ApproveQuote({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'האישור לא נשמר, אפשר לנסות שוב');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'האישור לא נשמר, אפשר לנסות שוב');
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <label className="block text-sm" style={{ color: C.text }}>
        שם המאשר/ת (לא חובה)
        <input
          value={name} onChange={e => setName(e.target.value)} maxLength={120}
          className="mt-1 w-full h-11 rounded-xl px-3 text-base border bg-white focus:outline-none"
          style={{ borderColor: C.border }} autoComplete="name"
        />
      </label>
      {error && <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</p>}
      <button
        onClick={approve} disabled={sending}
        className="w-full h-12 rounded-xl text-base font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: C.brand }}
      >
        {sending ? 'שולח…' : 'אישור ההצעה'}
      </button>
      <p className="text-xs text-center" style={{ color: C.soft }}>
        לאחר האישור ניצור קשר לתיאום התשלום והאספקה.
      </p>
    </div>
  );
}
