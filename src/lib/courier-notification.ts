// ============================================================================
// Courier delivery notification — single source of truth for the message
// content that goes out to a courier (WhatsApp + email + any future channel).
//
// Design rules — owner-mandated:
//   - NO greeting ("היי", "שלום").
//   - NO courier name in the body.
//   - DO include the actual delivery details (recipient, phone, address,
//     items, notes) so the courier sees what to do without opening the link.
//   - The delivery-update link is still present at the bottom — it's where
//     the courier sees the *full* page, calls/navigates, and marks delivered.
//   - Empty fields are omitted entirely (no "Field: —").
//   - NEVER include prices, payment data, invoices, internal-only notes,
//     tokens, API keys.
//
// Why a shared helper: the WhatsApp builder + the email builder used to drift
// (the email kept "היי {courier.name}" long after the WhatsApp body was
// neutralized; later the email became a generic "open this link" with no
// detail). Going through one function makes drift impossible — both
// channels render the same details from the same source.
// ============================================================================

// ── Detail shape ────────────────────────────────────────────────────────────

export interface CourierItem {
  name: string;
  quantity: number;
  petitFours?: Array<{ name: string; quantity: number }>;
  note?: string | null;
}

export interface CourierDeliveryDetails {
  recipientName?: string | null;
  recipientPhone?: string | null;
  // Combined "street, city" — the way most operators want to read it.
  // Either side may be null; helper joins what's present.
  addressStreet?: string | null;
  addressCity?: string | null;
  // Date is ISO (YYYY-MM-DD) or already-formatted display text.
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  orderNumber?: string | null;
  items?: CourierItem[];
  deliveryNotes?: string | null;
}

// Optional URL — when not present, the message/email is built without an
// action link (rare; use mainly for previews / tests).
export interface CourierNotificationOptions extends CourierDeliveryDetails {
  deliveryUpdateUrl: string;
}

export const COURIER_EMAIL_SUBJECT       = 'משלוח חדש מעדי תכשיט שוקולד';
export const COURIER_EMAIL_BUTTON_LABEL  = 'סמן נמסר';

// ── Helpers ─────────────────────────────────────────────────────────────────

function joinAddress(street?: string | null, city?: string | null): string | null {
  const parts = [street, city].map(s => (s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function formatDateHe(d?: string | null): string | null {
  if (!d) return null;
  const t = d.trim();
  if (!t) return null;
  // ISO YYYY-MM-DD → DD/MM/YYYY. Anything else passes through.
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

function formatTimeHe(t?: string | null): string | null {
  if (!t) return null;
  const trimmed = t.trim();
  if (!trimmed) return null;
  // "11:00:00" → "11:00". Free-text passes through (e.g. "גמיש").
  const m = trimmed.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : trimmed;
}

// "תאריך · שעה" / just one / null.
function formatDateTime(date?: string | null, time?: string | null): string | null {
  const d = formatDateHe(date);
  const t = formatTimeHe(time);
  if (d && t) return `${d} · ${t}`;
  return d || t || null;
}

// Trim a long string for WhatsApp readability — never truncate mid-word.
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp  = cut.lastIndexOf(' ');
  return (sp > 30 ? cut.slice(0, sp) : cut) + '…';
}

// ── WhatsApp body — compact, useful, link at the bottom ─────────────────────

export function buildCourierWhatsAppMessage(opts: CourierNotificationOptions): string {
  const lines: string[] = ['משלוח חדש מעדי תכשיט שוקולד', ''];

  if (opts.recipientName)  lines.push(`שם מקבל: ${opts.recipientName}`);
  if (opts.recipientPhone) lines.push(`טלפון: ${opts.recipientPhone}`);
  const addr = joinAddress(opts.addressStreet, opts.addressCity);
  if (addr) lines.push(`כתובת: ${addr}`);
  const when = formatDateTime(opts.deliveryDate, opts.deliveryTime);
  if (when) lines.push(`זמן: ${when}`);

  if (opts.orderNumber) {
    lines.push('');
    lines.push(`הזמנה: ${opts.orderNumber}`);
  }

  // Items — short summary. Up to 5 lines, then "+N נוספים". Petit-four
  // breakdown collapsed inline in parentheses (max 4 names) so the message
  // stays under WhatsApp's reasonable read length without losing the meat.
  if (opts.items && opts.items.length > 0) {
    lines.push('פריטים:');
    const shown = opts.items.slice(0, 5);
    for (const it of shown) {
      let row = `• ${it.quantity}× ${it.name}`;
      if (it.petitFours && it.petitFours.length > 0) {
        const pfNames = it.petitFours.slice(0, 4).map(p => `${p.name}×${p.quantity}`);
        const rest = it.petitFours.length - pfNames.length;
        row += ` (${pfNames.join(', ')}${rest > 0 ? `, +${rest} נוספים` : ''})`;
      }
      lines.push(clip(row, 200));
    }
    if (opts.items.length > shown.length) {
      lines.push(`+ ${opts.items.length - shown.length} פריטים נוספים — בקישור`);
    }
  }

  if (opts.deliveryNotes) {
    lines.push('');
    lines.push('הערות:');
    lines.push(clip(opts.deliveryNotes, 300));
  }

  lines.push('', 'לפתיחת פרטי המשלוח וסימון נמסר:');
  lines.push(opts.deliveryUpdateUrl);

  return lines.join('\n');
}

// ── Backward-compat alias — `buildCourierDeliveryMessage` was the previous
//    name. Old call sites still pass through this signature, so keep it.
export function buildCourierDeliveryMessage(opts: CourierNotificationOptions): string {
  return buildCourierWhatsAppMessage(opts);
}

// ── Email HTML — same details as WhatsApp, presented as cards ───────────────

export function buildCourierDeliveryEmailHtml(opts: CourierNotificationOptions): string {
  const addr = joinAddress(opts.addressStreet, opts.addressCity);
  const date = formatDateHe(opts.deliveryDate);
  const time = formatTimeHe(opts.deliveryTime);
  const hasTime = !!(date || time);

  const recipientCard = (opts.recipientName || opts.recipientPhone || addr)
    ? card('פרטי מקבל', [
        row('שם',     opts.recipientName, { bold: true }),
        row('טלפון',  opts.recipientPhone),
        row('כתובת',  addr),
      ])
    : '';

  const timeCard = hasTime
    ? card('זמן משלוח', [
        row('תאריך', date),
        row('שעה',   time),
      ])
    : '';

  const orderCard = (opts.orderNumber || (opts.items && opts.items.length > 0))
    ? card('פרטי ההזמנה', [
        row('מספר הזמנה', opts.orderNumber, { mono: true }),
        opts.items && opts.items.length > 0 ? itemsBlock(opts.items) : '',
      ])
    : '';

  const notesCard = opts.deliveryNotes
    ? noteCard('הערות', opts.deliveryNotes)
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>${COURIER_EMAIL_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#F7F1E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#3A2A1A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F1E8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto">

        <!-- Header -->
        <tr><td style="background-color:#5B3926;color:#F7F1E8;padding:22px 24px;border-radius:14px 14px 0 0;text-align:center">
          <div style="font-size:11px;letter-spacing:0.12em;color:#C9A45C;margin-bottom:4px">עדי תכשיט שוקולד</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:0.5px">משלוח חדש</div>
        </td></tr>

        <!-- Intro -->
        <tr><td style="background-color:#FFFDF9;padding:20px 24px 4px;border-right:1px solid #E8DED2;border-left:1px solid #E8DED2">
          <p style="margin:0;font-size:14px;line-height:1.55;color:#3A2A1A">
            פרטי המשלוח מופיעים כאן למטה.
          </p>
        </td></tr>

        <!-- Cards -->
        <tr><td style="background-color:#FFFDF9;padding:8px 16px;border-right:1px solid #E8DED2;border-left:1px solid #E8DED2">
          ${recipientCard}
          ${timeCard}
          ${orderCard}
          ${notesCard}
        </td></tr>

        <!-- CTA -->
        <tr><td style="background-color:#FFFDF9;padding:8px 24px 22px;border-right:1px solid #E8DED2;border-left:1px solid #E8DED2;text-align:center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px auto 16px">
            <tr><td align="center" style="border-radius:12px;background-color:#5B3926">
              <a href="${escapeAttr(opts.deliveryUpdateUrl)}"
                 target="_blank" rel="noopener noreferrer"
                 style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#FFFDF9;text-decoration:none;border-radius:12px">
                ${COURIER_EMAIL_BUTTON_LABEL}
              </a>
            </td></tr>
          </table>
          <div style="font-size:11px;color:#7B604D;margin-top:4px">
            לאחר המסירה, לחצו על הכפתור כדי לעדכן את המערכת.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#FDFAF5;border:1px solid #E8DED2;border-top:none;border-radius:0 0 14px 14px;padding:14px 24px;text-align:center">
          <div style="font-size:11px;color:#A89882">אין צורך בסיסמה</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── HTML building blocks ────────────────────────────────────────────────────

function card(title: string, rowsHtml: string[]): string {
  const inner = rowsHtml.filter(Boolean).join('');
  if (!inner.trim()) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F0;border:1px solid #EDE0CE;border-radius:12px;margin:10px 0">
    <tr><td style="padding:14px 16px">
      <div style="font-size:11px;font-weight:700;color:#5B3926;letter-spacing:0.06em;margin-bottom:8px;text-transform:uppercase">${escapeText(title)}</div>
      ${inner}
    </td></tr>
  </table>`;
}

function row(label: string, value?: string | null, opts: { bold?: boolean; mono?: boolean } = {}): string {
  if (!value || !value.trim()) return '';
  return `
  <div style="display:block;margin:4px 0">
    <span style="font-size:11.5px;color:#7B604D">${escapeText(label)}: </span>
    <span style="font-size:${opts.bold ? 15 : 13.5}px;font-weight:${opts.bold ? 700 : 500};color:#2B1A10;${opts.mono ? 'font-family:monospace;' : ''}word-break:break-word">${escapeText(value)}</span>
  </div>`;
}

function itemsBlock(items: CourierItem[]): string {
  const rows = items.map(it => {
    const pf = it.petitFours && it.petitFours.length > 0
      ? `<div style="font-size:11.5px;color:#7B604D;margin-top:2px">${escapeText(it.petitFours.map(p => `${p.name}×${p.quantity}`).join(', '))}</div>`
      : '';
    const note = it.note
      ? `<div style="font-size:11px;color:#8A7664;font-style:italic;margin-top:2px">${escapeText(it.note)}</div>`
      : '';
    return `
    <li style="padding:6px 10px;background-color:#FFFFFF;border:1px solid #EDE0CE;border-radius:8px;margin-bottom:6px;list-style:none">
      <div style="font-size:13.5px;color:#2B1A10">
        <span style="font-weight:700;color:#5B3926">×${it.quantity}</span> ${escapeText(it.name)}
      </div>
      ${pf}
      ${note}
    </li>`;
  }).join('');
  return `
  <div style="margin-top:8px">
    <div style="font-size:11px;color:#7B604D;margin-bottom:6px">פריטים בהזמנה</div>
    <ul style="margin:0;padding:0">${rows}</ul>
  </div>`;
}

function noteCard(title: string, body: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBF6EE;border:1px solid #E8D2A8;border-radius:12px;margin:10px 0">
    <tr><td style="padding:14px 16px">
      <div style="font-size:11px;font-weight:700;color:#7A4A27;letter-spacing:0.06em;margin-bottom:6px;text-transform:uppercase">${escapeText(title)}</div>
      <div style="font-size:13.5px;color:#2B1A10;line-height:1.5;white-space:pre-line">${escapeText(body)}</div>
    </td></tr>
  </table>`;
}

// ── Tiny escapers ──────────────────────────────────────────────────────────

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
