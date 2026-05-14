// One-click "סמן כנמסר" landing page used by the courier email button.
//
// This is a server component. Opening the URL marks the delivery delivered
// (idempotently) at request-time and renders a clean success/already/invalid
// page. No second click. No JSON. No CRM nav / sidebar — this route is
// outside the dashboard layout, mobile-first, RTL.
//
// The flow:
//   email button → GET /delivery-update/{token}/confirm
//     → markDeliveryDeliveredByToken(token)
//       → סטטוס_משלוח = 'נמסר', delivered_at = now
//       → linked order סטטוס_הזמנה = 'הושלמה בהצלחה' + ארכיון = true
//   → render outcome page
//
// The existing /delivery-update/[token] (no /confirm) page still exists for
// the in-app "view details" flow; the email no longer points to it.

export const dynamic = 'force-dynamic';

import { markDeliveryDeliveredByToken } from '@/lib/delivery-confirm';

const C = {
  bg:        '#F7F1E8',
  card:      '#FFFDF9',
  border:    '#E8DED2',
  textHead:  '#4B2E1F',
  textBody:  '#3A2A1A',
  textSoft:  '#7B604D',
  brand:     '#5B3926',
  green:     '#2F6B47',
  greenSoft: '#E5F1E8',
  blue:      '#3A5A75',
  blueSoft:  '#E5EEF1',
  red:       '#9B2C2C',
  redSoft:   '#FBEAEA',
};

export default async function DeliveryConfirmPage({ params }: { params: { token: string } }) {
  const outcome = await markDeliveryDeliveredByToken(params.token);

  let title:    string;
  let subtitle: string;
  let tone:     'success' | 'info' | 'error';

  if (!outcome.ok) {
    title    = 'לא נמצא משלוח מתאים';
    subtitle = 'הקישור אינו תקין, או שהמשלוח כבר נמחק מהמערכת.';
    tone     = 'error';
  } else if (outcome.status === 'already') {
    title    = 'המשלוח כבר סומן כנמסר';
    subtitle = 'אין צורך בפעולה נוספת — המערכת כבר עודכנה.';
    tone     = 'info';
  } else {
    title    = 'המשלוח סומן כנמסר בהצלחה';
    subtitle = 'תודה, המערכת עודכנה.';
    tone     = 'success';
  }

  const palette =
    tone === 'success' ? { bg: C.greenSoft, fg: C.green } :
    tone === 'info'    ? { bg: C.blueSoft,  fg: C.blue  } :
                         { bg: C.redSoft,   fg: C.red   };

  return (
    <main
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: '28px 24px',
          boxShadow: '0 8px 24px rgba(75,46,31,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: palette.bg,
              color: palette.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
            }}
            aria-hidden
          >
            {tone === 'success' ? '✓' : tone === 'info' ? 'i' : '!'}
          </div>
        </div>

        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 22,
            fontWeight: 700,
            color: C.textHead,
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: C.textSoft,
            textAlign: 'center',
            lineHeight: 1.55,
          }}
        >
          {subtitle}
        </p>

        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: `1px solid ${C.border}`,
            fontSize: 11,
            color: C.textSoft,
            textAlign: 'center',
          }}
        >
          עדי תכשיט שוקולד
        </div>
      </div>
    </main>
  );
}
