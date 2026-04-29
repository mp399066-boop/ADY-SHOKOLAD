'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface DeliveryInfo {
  שם_מקבל: string | null;
  כתובת: string | null;
  עיר: string | null;
  סטטוס_משלוח: string;
}

type PageStatus = 'loading' | 'ready' | 'done' | 'already' | 'invalid';

export default function DeliveryUpdatePage() {
  const params = useParams();
  const token = params?.token as string;

  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!token) { setPageStatus('invalid'); return; }
    fetch(`/api/delivery-update/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setPageStatus('invalid'); return; }
        setDelivery(data.delivery);
        setPageStatus(data.delivery.סטטוס_משלוח === 'נמסר' ? 'already' : 'ready');
      })
      .catch(() => setPageStatus('invalid'));
  }, [token]);

  const markDelivered = async () => {
    setMarking(true);
    try {
      const res = await fetch(`/api/delivery-update/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setPageStatus(data.already ? 'already' : 'invalid');
      } else {
        setPageStatus('done');
      }
    } catch {
      setPageStatus('invalid');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: '100vh', backgroundColor: '#FAF7F2' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '48px 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>🎁</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1E120A', margin: 0 }}>עדכון משלוח</h1>
        </div>

        {pageStatus === 'loading' && (
          <div style={{ textAlign: 'center', color: '#7A5840', padding: '48px 0' }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
            טוען...
          </div>
        )}

        {pageStatus === 'invalid' && (
          <div style={{ textAlign: 'center', padding: '40px 24px', background: '#FEF2F2', borderRadius: '20px', border: '1px solid #FECACA' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
            <div style={{ fontWeight: 700, color: '#991B1B', marginBottom: '8px' }}>קישור לא תקין</div>
            <div style={{ fontSize: '14px', color: '#B91C1C' }}>הקישור אינו תקין או שפג תוקפו</div>
          </div>
        )}

        {pageStatus === 'already' && (
          <div style={{ textAlign: 'center', padding: '40px 24px', background: '#ECFDF5', borderRadius: '20px', border: '1px solid #6EE7B7' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontWeight: 700, color: '#065F46', fontSize: '18px', marginBottom: '8px' }}>המשלוח כבר סומן</div>
            <div style={{ fontSize: '14px', color: '#047857' }}>המשלוח כבר סומן כנמסר</div>
          </div>
        )}

        {pageStatus === 'done' && (
          <div style={{ textAlign: 'center', padding: '40px 24px', background: '#ECFDF5', borderRadius: '20px', border: '1px solid #6EE7B7' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontWeight: 700, color: '#065F46', fontSize: '20px', marginBottom: '8px' }}>תודה, העדכון בוצע!</div>
            <div style={{ fontSize: '14px', color: '#047857' }}>המשלוח סומן כנמסר בהצלחה</div>
          </div>
        )}

        {pageStatus === 'ready' && delivery && (
          <div>
            <div style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '24px', border: '1px solid #E5DDD3', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#7A5840', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  שם מקבל
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1E120A' }}>
                  {delivery.שם_מקבל || '—'}
                </div>
              </div>

              {(delivery.כתובת || delivery.עיר) && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#7A5840', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                    כתובת
                  </div>
                  <div style={{ fontSize: '16px', color: '#3D2A1A' }}>
                    {[delivery.כתובת, delivery.עיר].filter(Boolean).join(', ')}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#7A5840', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  סטטוס
                </div>
                <span style={{
                  display: 'inline-block',
                  background: '#FFF7ED',
                  color: '#C2610F',
                  border: '1px solid #FED7AA',
                  borderRadius: '999px',
                  padding: '4px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}>
                  {delivery.סטטוס_משלוח}
                </span>
              </div>
            </div>

            <button
              onClick={markDelivered}
              disabled={marking}
              style={{
                width: '100%',
                padding: '18px',
                fontSize: '17px',
                fontWeight: 700,
                color: 'white',
                background: marking ? '#9CA3AF' : '#065F46',
                border: 'none',
                borderRadius: '16px',
                cursor: marking ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                boxShadow: marking ? 'none' : '0 4px 16px rgba(6,95,70,0.3)',
              }}
            >
              {marking ? '⏳ מעדכן...' : '✓ סמן כנמסר'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
