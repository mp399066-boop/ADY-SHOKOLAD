'use client';

// Public courier delivery page. Opened by the courier from the WhatsApp
// link sent on assignment. Token-protected — no login.
//
// Shows everything the courier needs for the drop-off (recipient, address,
// phone, items, notes) and three actions: call, navigate, mark-delivered.
// NEVER shows prices, payment status, invoices, or internal financial data.
//
// Mobile-first. No CRM nav / sidebar (this route is outside the dashboard
// layout). RTL throughout.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface DeliveryItem {
  name: string;
  quantity: number;
  isPackage: boolean;
  petitFours?: { name: string; quantity: number }[];
  note?: string | null;
}

interface DeliveryView {
  id: string;
  orderId: string | null;
  status: string;
  deliveredAt: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  deliveryNotes: string | null;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderNotes: string | null;
  items: DeliveryItem[];
}

type PageStatus = 'loading' | 'ready' | 'done' | 'already' | 'invalid';

// ── Brand palette ───────────────────────────────────────────────────────────
const C = {
  bg:           '#F7F1E8',
  card:         '#FFFDF9',
  border:       '#E8DED2',
  textHead:     '#4B2E1F',
  textBody:     '#3A2A1A',
  textSoft:     '#7B604D',
  textMuted:    '#A89882',
  brand:        '#5B3926',
  brandHover:   '#4B2E1F',
  gold:         '#C9A45C',
  goldSoft:     '#F4E9DC',
  green:        '#2F6B47',
  greenSoft:    '#E5F1E8',
  blue:         '#3A5A75',
  blueSoft:     '#E5EEF1',
};

function formatDateHe(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

function formatTime(t: string | null): string {
  if (!t) return '';
  // DB time can come as "11:00:00" — show only HH:MM.
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t;
}

function buildMapsUrl(street: string | null, city: string | null): string | null {
  const addr = [street, city].filter(Boolean).join(', ');
  if (!addr) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

export default function DeliveryUpdatePage() {
  const params = useParams();
  const token = params?.token as string;

  const [delivery, setDelivery] = useState<DeliveryView | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!token) { setPageStatus('invalid'); return; }
    fetch(`/api/delivery-update/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setPageStatus('invalid'); return; }
        const d = data.delivery as DeliveryView;
        setDelivery(d);
        setPageStatus(d.status === 'נמסר' ? 'already' : 'ready');
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
        return;
      }
      // Server returns { ok: true, already: true } when nothing changed,
      // and { ok: true, delivered: true, orderCompleted } on a fresh flip.
      if (data.already) setPageStatus('already');
      else              setPageStatus('done');
    } catch {
      setPageStatus('invalid');
    } finally {
      setMarking(false);
    }
  };

  const addressFull = delivery
    ? [delivery.addressStreet, delivery.addressCity].filter(Boolean).join(', ')
    : '';
  const mapsUrl = delivery ? buildMapsUrl(delivery.addressStreet, delivery.addressCity) : null;

  return (
    <div dir="rtl" style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 40px' }}>

        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.12em', marginBottom: 4 }}>
            עדי תכשיט שוקולד
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.textHead, margin: 0 }}>
            פרטי משלוח
          </h1>
          {delivery && pageStatus !== 'invalid' && (
            <div style={{ marginTop: 10 }}>
              <StatusPill status={delivery.status} />
            </div>
          )}
        </header>

        {pageStatus === 'loading' && (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.textSoft, fontSize: 14 }}>
              טוען פרטי משלוח…
            </div>
          </Card>
        )}

        {pageStatus === 'invalid' && (
          <Card style={{ borderColor: '#F0C7BF', backgroundColor: '#FBF1EE' }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontWeight: 700, color: '#7A2C1F', fontSize: 16, marginBottom: 6 }}>
                המשלוח לא נמצא או שכבר אינו פעיל
              </div>
              <div style={{ fontSize: 13, color: '#9D4B4A' }}>
                הקישור אינו תקין, פג תוקפו, או שהמשלוח נמחק.
              </div>
            </div>
          </Card>
        )}

        {pageStatus === 'done' && (
          <Card style={{ borderColor: '#A8D5B6', backgroundColor: C.greenSoft }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 800, color: C.green, fontSize: 18, marginBottom: 6 }}>
                תודה, העדכון בוצע!
              </div>
              <div style={{ fontSize: 13, color: '#1F5635' }}>
                המשלוח סומן כנמסר בהצלחה.
              </div>
            </div>
          </Card>
        )}

        {pageStatus === 'already' && delivery && (
          <Card style={{ borderColor: '#A8D5B6', backgroundColor: C.greenSoft }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 800, color: C.green, fontSize: 18, marginBottom: 6 }}>
                המשלוח כבר סומן כנמסר
              </div>
              {delivery.deliveredAt && (
                <div style={{ fontSize: 12, color: '#1F5635' }}>
                  זמן מסירה: {formatDateHe(delivery.deliveredAt)} {new Date(delivery.deliveredAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </Card>
        )}

        {(pageStatus === 'ready' || pageStatus === 'already') && delivery && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>

            {/* ── Card: recipient ───────────────────────────────────── */}
            <Card>
              <CardTitle>פרטי מקבל המשלוח</CardTitle>
              <Field label="שם מקבל" value={delivery.recipientName || '—'} bold />
              {delivery.recipientPhone && (
                <Field label="טלפון" value={delivery.recipientPhone} />
              )}
              {addressFull && (
                <Field label="כתובת" value={addressFull} />
              )}
            </Card>

            {/* ── Card: time ─────────────────────────────────────────── */}
            {(delivery.deliveryDate || delivery.deliveryTime) && (
              <Card>
                <CardTitle>זמני אספקה</CardTitle>
                {delivery.deliveryDate && (
                  <Field label="תאריך" value={formatDateHe(delivery.deliveryDate)} />
                )}
                {delivery.deliveryTime && (
                  <Field label="שעה / חלון זמן" value={formatTime(delivery.deliveryTime)} />
                )}
              </Card>
            )}

            {/* ── Card: order ────────────────────────────────────────── */}
            {(delivery.orderNumber || delivery.customerName || delivery.items.length > 0) && (
              <Card>
                <CardTitle>פרטי ההזמנה</CardTitle>
                {delivery.orderNumber && (
                  <Field label="מספר הזמנה" value={delivery.orderNumber} mono />
                )}
                {delivery.customerName && (
                  <Field label="לקוחה מזמינה" value={delivery.customerName} />
                )}
                {delivery.customerPhone && (
                  <Field label="טלפון לקוחה" value={delivery.customerPhone} />
                )}

                {delivery.items.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, letterSpacing: '0.05em', marginBottom: 6 }}>
                      פריטים בהזמנה
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {delivery.items.map((it, idx) => (
                        <li key={idx} style={{ padding: '8px 10px', backgroundColor: C.goldSoft, borderRadius: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.textBody }}>
                            <span style={{ color: C.brand, fontWeight: 800 }}>×{it.quantity}</span>{' '}
                            {it.name}
                          </div>
                          {it.petitFours && it.petitFours.length > 0 && (
                            <ul style={{ listStyle: 'none', padding: '6px 0 0 0', margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {it.petitFours.map((pf, j) => (
                                <li key={j} style={{ fontSize: 12, color: C.textSoft }}>
                                  • {pf.name} ×{pf.quantity}
                                </li>
                              ))}
                            </ul>
                          )}
                          {it.note && (
                            <div style={{ marginTop: 4, fontSize: 11.5, color: C.textSoft, fontStyle: 'italic' }}>
                              · {it.note}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* ── Card: notes for the courier ────────────────────────── */}
            {(delivery.deliveryNotes || delivery.orderNotes) && (
              <Card style={{ borderColor: '#F0C7BF', backgroundColor: '#FBF6EE' }}>
                <CardTitle style={{ color: C.brand }}>הערות חשובות</CardTitle>
                {delivery.deliveryNotes && (
                  <div style={{ fontSize: 13.5, color: C.textBody, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {delivery.deliveryNotes}
                  </div>
                )}
                {delivery.orderNotes && delivery.orderNotes !== delivery.deliveryNotes && (
                  <div style={{ marginTop: 8, fontSize: 13.5, color: C.textBody, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {delivery.orderNotes}
                  </div>
                )}
              </Card>
            )}

            {/* ── Action buttons ─────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              {delivery.recipientPhone && (
                <ActionButton
                  href={`tel:${delivery.recipientPhone.replace(/[^\d+]/g, '')}`}
                  label="התקשר למקבל"
                  icon="📞"
                  variant="secondary"
                />
              )}
              {mapsUrl && (
                <ActionButton
                  href={mapsUrl}
                  label="פתח ניווט"
                  icon="🗺️"
                  variant="secondary"
                  external
                />
              )}

              {pageStatus === 'ready' && (
                <button
                  onClick={markDelivered}
                  disabled={marking}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '18px',
                    fontSize: 17,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    background: marking ? '#9B8B7A' : C.brand,
                    border: 'none',
                    borderRadius: 14,
                    cursor: marking ? 'not-allowed' : 'pointer',
                    boxShadow: marking ? 'none' : '0 4px 14px rgba(75,46,31,0.32)',
                    transition: 'background 0.2s, transform 0.1s',
                  }}
                  onMouseDown={e => { if (!marking) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.99)'; }}
                  onMouseUp={e =>   { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  {marking ? '⏳ מעדכן…' : '✓ סמן כנמסר'}
                </button>
              )}
            </div>

          </div>
        )}

        {/* Footer credit */}
        <div style={{ textAlign: 'center', marginTop: 28, fontSize: 11, color: C.textMuted }}>
          קישור פרטי לשליח — אין צורך בסיסמה
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        padding: 16,
        boxShadow: '0 2px 8px rgba(75,46,31,0.05)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: C.brand,
        letterSpacing: '0.07em',
        marginBottom: 12,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: C.textSoft, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: bold ? 15 : 14,
          color: C.textBody,
          fontWeight: bold ? 700 : 500,
          textAlign: 'left',
          fontFamily: mono ? 'monospace' : 'inherit',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'נמסר'
      ? { bg: C.greenSoft, fg: C.green,  border: '#A8D5B6' }
      : status === 'נאסף'
        ? { bg: C.blueSoft,  fg: C.blue,   border: '#BFD3DC' }
        : { bg: C.goldSoft,  fg: C.brand,  border: '#E2CDA4' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 16px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        backgroundColor: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
    >
      {status}
    </span>
  );
}

function ActionButton({
  href, label, icon, variant, external,
}: {
  href: string;
  label: string;
  icon: string;
  variant: 'primary' | 'secondary';
  external?: boolean;
}) {
  const styles = variant === 'primary'
    ? { bg: C.brand, fg: '#FFFFFF', border: C.brand }
    : { bg: C.card,  fg: C.brand,   border: C.border };
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '14px',
        fontSize: 15,
        fontWeight: 700,
        color: styles.fg,
        backgroundColor: styles.bg,
        border: `1.5px solid ${styles.border}`,
        borderRadius: 12,
        textDecoration: 'none',
        transition: 'background 0.15s',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </a>
  );
}
