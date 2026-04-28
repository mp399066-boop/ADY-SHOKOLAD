'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { IconWhatsApp } from '@/components/icons';
import toast from 'react-hot-toast';
import type { CommunicationLog } from '@/types/database';

/* ─── tiny inline dialog ─────────────────────────────────────────────────── */
function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-gray-100 transition-colors"
            style={{ color: '#9B7A5A' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── types ──────────────────────────────────────────────────────────────── */
type CommStatus = 'pending' | 'sent' | 'failed';
interface CommItem extends CommunicationLog { _status?: CommStatus }

export interface CustomerCommunicationProps {
  customerId: string;
  phone?: string | null;
  email?: string | null;
  history?: CommunicationLog[];
  onSend?: (log: CommunicationLog) => void;
}

/* ─── main component ─────────────────────────────────────────────────────── */
export function CustomerCommunication({
  customerId,
  phone,
  email,
  history = [],
  onSend,
}: CustomerCommunicationProps) {
  const [waOpen, setWaOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [waPhone, setWaPhone] = useState(phone || '');
  const [waMessage, setWaMessage] = useState('');
  const [emailAddr, setEmailAddr] = useState(email || '');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState<CommItem[]>(history);

  useEffect(() => { setItems(history); }, [history]);

  /* optimistic helpers */
  const addOptimistic = (type: 'מייל' | 'וואטסאפ', content: string) => {
    const tempId = `tmp-${Date.now()}`;
    setItems(prev => [{
      id: tempId, לקוח_id: customerId, סוג: type,
      תוכן: content, תאריך: new Date().toISOString(),
      תאריך_יצירה: new Date().toISOString(), _status: 'pending',
    }, ...prev]);
    return tempId;
  };

  const resolveItem = (tempId: string, status: CommStatus, real?: CommunicationLog) =>
    setItems(prev => prev.map(i =>
      i.id === tempId ? (real ? { ...real, _status: status } : { ...i, _status: status }) : i
    ));

  /* send whatsapp */
  const handleSendWhatsApp = async () => {
    if (!waMessage.trim()) { toast.error('יש להזין הודעה'); return; }
    setSending(true);
    const content = waMessage;
    const tempId = addOptimistic('וואטסאפ', content);
    setWaOpen(false); setWaMessage('');
    try {
      const res = await fetch(`/api/customers/${customerId}/communication`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סוג: 'וואטסאפ', תוכן: content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      resolveItem(tempId, 'sent', json.data);
      onSend?.(json.data);
      toast.success('תועד בהצלחה');
      if (waPhone) {
        const n = waPhone.replace(/^0/, '').replace(/-/g, '');
        window.open(`https://wa.me/972${n}?text=${encodeURIComponent(content)}`, '_blank');
      }
    } catch (err: unknown) {
      resolveItem(tempId, 'failed');
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally { setSending(false); }
  };

  /* send email */
  const handleSendEmail = async () => {
    if (!emailBody.trim()) { toast.error('יש להזין תוכן'); return; }
    setSending(true);
    const content = emailSubject ? `${emailSubject}\n\n${emailBody}` : emailBody;
    const tempId = addOptimistic('מייל', content);
    setEmailOpen(false); setEmailSubject(''); setEmailBody('');
    try {
      const res = await fetch(`/api/customers/${customerId}/communication`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סוג: 'מייל', תוכן: content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      resolveItem(tempId, 'sent', json.data);
      onSend?.(json.data);
      toast.success('תועד בהצלחה');
      if (emailAddr)
        window.open(`mailto:${emailAddr}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`, '_blank');
    } catch (err: unknown) {
      resolveItem(tempId, 'failed');
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally { setSending(false); }
  };

  return (
    <>
      <Card className="p-0 overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #EDE0CE' }}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F0E6D6' }}>
              <svg className="w-4 h-4" fill="none" stroke="#8B5E34" viewBox="0 0 24 24" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>תקשורת עם הלקוח</span>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
            {items.length}
          </span>
        </div>

        {/* action buttons */}
        <div className="grid grid-cols-2 gap-2 px-5 py-4">
          <button
            onClick={() => setWaOpen(true)}
            className="h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:brightness-105"
            style={{ backgroundColor: '#25D366', color: '#fff' }}
          >
            <IconWhatsApp className="w-4 h-4" />
            WhatsApp
          </button>
          <button
            onClick={() => setEmailOpen(true)}
            className="h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium border transition-all hover:bg-amber-50"
            style={{ borderColor: '#C7A46B', color: '#8B5E34', backgroundColor: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            מייל
          </button>
        </div>

        {/* history */}
        <div className="px-5 pb-5 space-y-2 max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-8 text-center">
              <div className="h-12 w-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#F5ECD8' }}>
                <svg className="w-5 h-5" fill="none" stroke="#8B5E34" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: '#6B4A2D' }}>אין תיעוד תקשורת עדיין</p>
              <div className="flex justify-center gap-2 mt-3">
                <button onClick={() => setWaOpen(true)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
                  שלח WhatsApp
                </button>
                <button onClick={() => setEmailOpen(true)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
                  שלח מייל
                </button>
              </div>
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="rounded-xl p-3 border"
                style={{
                  borderColor: item._status === 'failed' ? '#FCA5A5' : '#EDE0CE',
                  backgroundColor: item._status === 'pending' ? '#FAF7F0' : '#fff',
                  opacity: item._status === 'pending' ? 0.75 : 1,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={item.סוג === 'וואטסאפ'
                      ? { backgroundColor: '#DCFCE7', color: '#166534' }
                      : { backgroundColor: '#EFF6FF', color: '#1D4ED8' }}
                  >
                    {item.סוג === 'וואטסאפ' ? 'WhatsApp' : 'מייל'}
                  </span>
                  {(item._status || item.סטטוס) && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={(item._status === 'sent' || item.סטטוס === 'נשלח')
                        ? { backgroundColor: '#DCFCE7', color: '#166534' }
                        : (item._status === 'failed' || item.סטטוס === 'נכשל')
                        ? { backgroundColor: '#FEE2E2', color: '#991B1B' }
                        : { backgroundColor: '#FEF9C3', color: '#854D0E' }}
                    >
                      {item._status === 'pending' ? 'בהמתנה'
                        : (item._status === 'failed' || item.סטטוס === 'נכשל') ? 'נכשל'
                        : 'נשלח'}
                    </span>
                  )}
                  <span className="text-xs mr-auto" style={{ color: '#9B7A5A' }}>
                    {new Date(item.תאריך).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {item.נושא && (
                  <p className="text-xs font-medium mb-0.5 truncate" style={{ color: '#5C3D22' }}>{item.נושא}</p>
                )}
                <p className="text-sm line-clamp-2" style={{ color: '#2B1A10' }}>{item.תוכן}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* WhatsApp dialog */}
      <Dialog open={waOpen} onClose={() => setWaOpen(false)} title="שליחת WhatsApp">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>טלפון</label>
            <input
              dir="ltr"
              value={waPhone}
              onChange={e => setWaPhone(e.target.value)}
              placeholder="05X-XXXXXXX"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>הודעה</label>
            <textarea
              value={waMessage}
              onChange={e => setWaMessage(e.target.value)}
              placeholder="תוכן ההודעה..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            />
          </div>
          <button
            onClick={handleSendWhatsApp}
            disabled={sending}
            className="w-full h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:brightness-105 disabled:opacity-50"
            style={{ backgroundColor: '#25D366', color: '#fff' }}
          >
            <IconWhatsApp className="w-4 h-4" />
            שלח
          </button>
        </div>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title="שליחת מייל">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>כתובת מייל</label>
            <input
              dir="ltr"
              type="email"
              value={emailAddr}
              onChange={e => setEmailAddr(e.target.value)}
              placeholder="example@email.com"
              className="w-full px-3 py-2 text-sm rounded-lg border text-left focus:outline-none"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>נושא</label>
            <input
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              placeholder="נושא המייל..."
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#4A2F1B' }}>תוכן</label>
            <textarea
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              placeholder="תוכן ההודעה..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            />
          </div>
          <button
            onClick={handleSendEmail}
            disabled={sending}
            className="w-full h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: '#8B5E34', color: '#fff' }}
          >
            שלח מייל
          </button>
        </div>
      </Dialog>
    </>
  );
}
