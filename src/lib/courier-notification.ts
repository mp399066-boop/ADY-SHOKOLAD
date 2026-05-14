// ============================================================================
// Courier delivery notification — single source of truth for the message
// content that goes out to a courier (WhatsApp + email + any future channel).
//
// Design rules — owner-mandated:
//   - NO greeting ("היי", "שלום").
//   - NO courier name in the body.
//   - NO recipient / address / phone inline (the link is the source of truth).
//   - One delivery-update link.
//   - Explicit instruction: open the link to see all details.
//
// Why a shared helper: the WhatsApp builder + the email builder used to drift
// (the email kept "היי {courier.name}" long after the WhatsApp body was
// neutralized). Going through one function makes that impossible — both
// channels render the exact same wording from the same source.
// ============================================================================

export interface CourierNotificationOptions {
  /**
   * The full /delivery-update/{token} URL the courier should open.
   * Required — both WhatsApp and email lead the courier here.
   */
  deliveryUpdateUrl: string;
}

/**
 * Plain-text body, used by:
 *   - WhatsApp message (encoded into wa.me?text=)
 *   - Email text/plain alternate
 *
 * Returns multi-line text; caller decides how to render newlines.
 */
export function buildCourierDeliveryMessage({ deliveryUpdateUrl }: CourierNotificationOptions): string {
  return [
    'משלוח חדש מעדי תכשיט שוקולד',
    '',
    'לצפייה בפרטי המשלוח וההזמנה ולסימון מסירה:',
    deliveryUpdateUrl,
    '',
    'יש לפתוח את הקישור כדי לראות שם מקבל, כתובת, טלפון, הערות ופרטי הזמנה.',
  ].join('\n');
}

export const COURIER_EMAIL_SUBJECT = 'משלוח חדש מעדי תכשיט שוקולד';
export const COURIER_EMAIL_BUTTON_LABEL = 'צפייה בפרטי המשלוח וסימון מסירה';

/**
 * HTML body for the courier email. Visually polished but the wording is
 * the EXACT same concept as buildCourierDeliveryMessage.
 *
 * Important — no <p>היי X</p>, no recipient name, no address, no phone.
 * The button is the only action; the link target is the courier delivery
 * page where every detail and the "סמן כנמסר" button live.
 */
export function buildCourierDeliveryEmailHtml({ deliveryUpdateUrl }: CourierNotificationOptions): string {
  // Inline-styled HTML for SendGrid. Avoid CSS classes — many email
  // clients drop <style> blocks. RTL throughout.
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>משלוח חדש מעדי תכשיט שוקולד</title>
</head>
<body style="margin:0;padding:0;background-color:#F7F1E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#3A2A1A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F1E8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin:0 auto">

        <!-- Header band -->
        <tr><td style="background-color:#5B3926;color:#F7F1E8;padding:22px 24px;border-radius:14px 14px 0 0;text-align:center">
          <div style="font-size:11px;letter-spacing:0.12em;color:#C9A45C;margin-bottom:4px">עדי תכשיט שוקולד</div>
          <div style="font-size:20px;font-weight:700;letter-spacing:0.5px">משלוח חדש</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color:#FFFDF9;padding:26px 24px;border-right:1px solid #E8DED2;border-left:1px solid #E8DED2">
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.5;color:#3A2A1A">
            לצפייה בפרטי המשלוח וההזמנה ולסימון מסירה, יש ללחוץ על הכפתור:
          </p>

          <!-- CTA button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto">
            <tr><td align="center" style="border-radius:12px;background-color:#5B3926">
              <a href="${escapeAttr(deliveryUpdateUrl)}"
                 style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#FFFDF9;text-decoration:none;border-radius:12px"
                 target="_blank" rel="noopener noreferrer">
                ${COURIER_EMAIL_BUTTON_LABEL}
              </a>
            </td></tr>
          </table>

          <p style="margin:18px 0 0 0;font-size:13px;line-height:1.5;color:#7B604D;text-align:center">
            יש לפתוח את הקישור כדי לראות שם מקבל, כתובת, טלפון, הערות ופרטי הזמנה.
          </p>

          <!-- Plain-text fallback link (in case the button doesn't render) -->
          <p style="margin:22px 0 0 0;padding:12px;background-color:#F4E9DC;border-radius:8px;font-size:11px;line-height:1.5;color:#7B604D;word-break:break-all;text-align:center">
            <span style="color:#5B3926;font-weight:700">קישור ישיר:</span><br>
            <a href="${escapeAttr(deliveryUpdateUrl)}" style="color:#5B3926;text-decoration:underline" target="_blank" rel="noopener noreferrer">${escapeText(deliveryUpdateUrl)}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#FDFAF5;border:1px solid #E8DED2;border-top:none;border-radius:0 0 14px 14px;padding:14px 24px;text-align:center">
          <div style="font-size:11px;color:#A89882">קישור פרטי לשליח · אין צורך בסיסמה</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Tiny escapers (no external deps) ──────────────────────────────────────

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
