'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import type { CommunicationLog } from '@/types/database';

/* ─── types ──────────────────────────────────────────────────────────────── */
type CommItem = CommunicationLog & { _status?: 'pending' | 'sent' | 'failed' };

export interface CustomerCommunicationProps {
  customerId: string;
  phone?: string | null;
  email?: string | null;
  history?: CommunicationLog[];
  onSend?: (log: CommunicationLog) => void;
}

/* ─── send arrow icon ────────────────────────────────────────────────────── */
function ArrowSend({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */
export function CustomerCommunication({
  customerId,
  phone,
  email,
  history = [],
  onSend,
}: CustomerCommunicationProps) {
  const [items, setItems] = useState<CommItem[]>(history);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [waMsg, setWaMsg] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const waEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setItems(history); }, [history]);

  const emailItems = items.filter(i => i.סוג === 'מייל');
  const waItems = items.filter(i => i.סוג === 'וואטסאפ');

  useEffect(() => {
    waEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [waItems.length]);

  /* optimistic helpers */
  function addOpt(partial: Omit<CommItem, 'id' | 'תאריך_יצירה'>): string {
    const id = `tmp-${Date.now()}`;
    setItems(prev => [{ id, תאריך_יצירה: new Date().toISOString(), _status: 'pending', ...partial }, ...prev]);
    return id;
  }

  function resolveOpt(id: string, status: 'sent' | 'failed', real?: CommunicationLog) {
    setItems(prev => prev.map(i =>
      i.id === id ? (real ? { ...real, _status: status } : { ...i, _status: status }) : i
    ));
  }

  /* send email */
  async function handleSendEmail() {
    if (!emailBody.trim()) { toast.error('יש להזין תוכן'); return; }
    if (!email) { toast.error('ללקוח אין כתובת מייל'); return; }
    setEmailSending(true);
    const subject = emailSubject.trim();
    const content = emailBody.trim();
    const tmpId = addOpt({
      לקוח_id: customerId, סוג: 'מייל', תוכן: content,
      תאריך: new Date().toISOString(), נושא: subject || null,
      אל: email, כיוון: 'יוצא', סטטוס: 'בהמתנה',
    });
    setEmailSubject(''); setEmailBody('');
    try {
      const res = await fetch(`/api/customers/${customerId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, content, to: email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      resolveOpt(tmpId, 'sent', json.data);
      onSend?.(json.data);
      toast.success('מייל נשלח');
    } catch (err: unknown) {
      resolveOpt(tmpId, 'failed');
      toast.error(err instanceof Error ? err.message : 'שגיאה בשליחה');
    } finally { setEmailSending(false); }
  }

  /* send whatsapp */
  async function handleSendWA() {
    if (!waMsg.trim()) { toast.error('יש להזין הודעה'); return; }
    setWaSending(true);
    const content = waMsg.trim();
    const tmpId = addOpt({
      לקוח_id: customerId, סוג: 'וואטסאפ', תוכן: content,
      תאריך: new Date().toISOString(), כיוון: 'יוצא',
      אל: phone || null, סטטוס: 'בהמתנה',
    });
    setWaMsg('');
    try {
      const res = await fetch(`/api/customers/${customerId}/communication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סוג: 'וואטסאפ', תוכן: content, כיוון: 'יוצא', אל: phone || null, סטטוס: 'נשלח' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      resolveOpt(tmpId, 'sent', json.data);
      onSend?.(json.data);
      if (phone) {
        const n = phone.replace(/^0/, '').replace(/-/g, '');
        window.open(`https://wa.me/972${n}?text=${encodeURIComponent(content)}`, '_blank');
      }
    } catch (err: unknown) {
      resolveOpt(tmpId, 'failed');
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally { setWaSending(false); }
  }

  function onEmailKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendEmail(); }
  }
  function onWAKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendWA(); }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  /* ── status chip helper ── */
  function statusChip(item: CommItem) {
    const s = item.סטטוס
      || (item._status === 'pending' ? 'בהמתנה' : item._status === 'failed' ? 'נכשל' : 'נשלח');
    const style =
      s === 'נשלח'   ? { backgroundColor: '#DCFCE7', color: '#166534' } :
      s === 'נכשל'   ? { backgroundColor: '#FEE2E2', color: '#991B1B' } :
                        { backgroundColor: '#FEF9C3', color: '#854D0E' };
    return (
      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={style}>{s}</span>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* ═══════════════════════════ EMAIL PANEL ═══════════════════════════ */}
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{ height: 480, border: '1px solid #EDE0CE' }}
      >
        {/* header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#7B1520', borderBottom: '1px solid #621019' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-white">מיילים</span>
            {email && (
              <span className="text-xs text-white opacity-75 truncate">{email}</span>
            )}
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          >
            {emailItems.length}
          </span>
        </div>

        {/* message list */}
        <div className="flex-1 overflow-y-auto divide-y divide-amber-100" style={{ backgroundColor: '#fff' }}>
          {emailItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 py-10">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#F5ECD8' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="#8B5E34" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <p className="text-xs" style={{ color: '#9B7A5A' }}>
                {email ? 'אין מיילים עדיין' : 'ללקוח אין כתובת מייל'}
              </p>
            </div>
          ) : (
            emailItems.map(item => (
              <div
                key={item.id}
                className="px-4 py-3 hover:bg-amber-50 transition-colors"
                style={{ opacity: item._status === 'pending' ? 0.65 : 1 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="font-medium text-sm truncate flex-1"
                    style={{ color: '#2B1A10' }}
                  >
                    {item.נושא || 'ללא נושא'}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: '#9B7A5A' }}>
                    {fmtDate(item.תאריך)}
                  </span>
                </div>
                <p className="text-xs mt-0.5 line-clamp-1" style={{ color: '#6B4A2D' }}>
                  {item.תוכן}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {statusChip(item)}
                  {item.אל && (
                    <span className="text-xs" style={{ color: '#BFB09A' }}>→ {item.אל}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* compose */}
        <div
          className="flex-shrink-0 p-3 space-y-2"
          style={{ borderTop: '1px solid #EDE0CE', backgroundColor: '#FAF7F0' }}
        >
          <input
            type="text"
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
            placeholder="נושא..."
            className="w-full text-sm px-3 py-1.5 rounded-lg border bg-white focus:outline-none"
            style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
          />
          <div className="flex items-end gap-2">
            <textarea
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              onKeyDown={onEmailKey}
              placeholder={email ? 'כתוב הודעה... (Enter לשליחה, Shift+Enter לשורה)' : 'ללקוח אין כתובת מייל'}
              rows={2}
              disabled={!email}
              className="flex-1 text-sm px-3 py-2 rounded-lg border bg-white resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            />
            <button
              onClick={() => void handleSendEmail()}
              disabled={emailSending || !emailBody.trim() || !email}
              className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center transition-all hover:brightness-110 disabled:opacity-35"
              style={{ backgroundColor: '#8B5E34', color: '#fff' }}
            >
              <ArrowSend />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════ WHATSAPP PANEL ══════════════════════════ */}
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{ height: 480, border: '1px solid #A8D5A8' }}
      >
        {/* header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#075E54', borderBottom: '1px solid #064d44' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-white">WhatsApp</span>
            {phone && (
              <span className="text-xs text-white opacity-75 truncate">{phone}</span>
            )}
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          >
            {waItems.length}
          </span>
        </div>

        {/* chat bubbles */}
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-2 p-3"
          dir="rtl"
          style={{ backgroundColor: '#ECE5DD' }}
        >
          {waItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#D1EDD4' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="#166534" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-xs" style={{ color: '#5F6B5F' }}>
                {phone ? 'אין הודעות עדיין' : 'ללקוח אין מספר טלפון'}
              </p>
            </div>
          ) : (
            [...waItems].reverse().map(item => {
              const isOut = item.כיוון !== 'נכנס';
              const failed = item._status === 'failed' || item.סטטוס === 'נכשל';
              return (
                <div key={item.id} className={`flex ${isOut ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className="max-w-[78%] px-3 py-2"
                    style={{
                      backgroundColor: isOut ? '#DCF8C6' : '#ffffff',
                      borderRadius: isOut ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                      opacity: item._status === 'pending' ? 0.65 : 1,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  >
                    <p className="text-sm whitespace-pre-wrap" style={{ color: '#1A1A1A' }}>
                      {item.תוכן}
                    </p>
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <span className="text-xs" style={{ color: failed ? '#DC2626' : '#8DAF8D' }}>
                        {failed ? 'נכשל' : fmtTime(item.תאריך)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={waEndRef} />
        </div>

        {/* compose */}
        <div
          className="flex-shrink-0 flex items-end gap-2 p-3"
          style={{ borderTop: '1px solid #A8D5A8', backgroundColor: '#F0F4F0' }}
        >
          <textarea
            value={waMsg}
            onChange={e => setWaMsg(e.target.value)}
            onKeyDown={onWAKey}
            placeholder="הודעה... (Enter לשליחה)"
            rows={1}
            className="flex-1 text-sm px-3 py-2 rounded-2xl border bg-white resize-none focus:outline-none"
            style={{ borderColor: '#B8D4B8', color: '#1A1A1A', maxHeight: 80, overflowY: 'auto' }}
          />
          <button
            onClick={() => void handleSendWA()}
            disabled={waSending || !waMsg.trim()}
            className="h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center transition-all hover:brightness-110 disabled:opacity-35"
            style={{ backgroundColor: '#25D366', color: '#fff' }}
          >
            <ArrowSend />
          </button>
        </div>
      </div>

    </div>
  );
}
