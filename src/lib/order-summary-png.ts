// Client-only order-summary image generator.
//
// Renders a clean, RTL summary of an order to a PNG entirely in the browser
// (Canvas 2D — no extra dependency, nothing saved to Supabase) and triggers a
// download named order-summary-{orderNumber}.png. Intended for sharing on
// WhatsApp. It only draws data the caller passes in (which is data already
// shown on the order page) and skips any empty field.
//
// Colours match the system palette used across the order detail page.

import { formatCurrency } from './utils';

export interface OrderSummaryItem {
  name: string;
  qty: number;
  lineTotal: number;
  /** Optional sub-lines (e.g. petit-four breakdown for a package). */
  sub?: string[];
}

export interface OrderSummaryData {
  orderNumber: string;
  customerName?: string;
  deliveryType?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveryFlexible?: boolean;
  address?: string;
  items: OrderSummaryItem[];
  notes?: string;
  /** Order-level discount amount (positive number). */
  discount?: number;
  /** Label for the discount row, e.g. "הנחה (10%)". */
  discountLabel?: string;
  deliveryFee?: number;
  total: number;
}

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bgTop: '#FFFDF8',
  bgBottom: '#FBF5EA',
  card: '#FFFFFF',
  brown: '#8B5E34',
  dark: '#2B1A10',
  muted: '#9B7A5A',
  label: '#6B4A2D',
  border: '#EAE0D4',
  borderStrong: '#E7D2A6',
  discount: '#15803D',
};

const FONT = (size: number, weight: 'normal' | 'bold' = 'normal') =>
  `${weight === 'bold' ? '700 ' : ''}${size}px Arial, "Segoe UI", sans-serif`;

// Layout (logical px — multiplied by SCALE for a crisp bitmap)
const SCALE = 2;
const W = 760;
const PAD = 44;
const CONTENT_W = W - PAD * 2;

// Shortens text to fit maxWidth, appending an ellipsis. Used for single-line
// fields (e.g. an item name) so a long value never overlaps the amount column.
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t.trimEnd()}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Builds the PNG and triggers a browser download. Resolves once the download
 * has been started. Throws if the canvas context is unavailable.
 */
export async function downloadOrderSummaryPng(data: OrderSummaryData): Promise<void> {
  // A measuring canvas to compute text wrapping / total height first.
  const measure = document.createElement('canvas');
  const mctx = measure.getContext('2d');
  if (!mctx) throw new Error('canvas-unavailable');

  // ── Build the row layout (label/value pairs + items) and compute height ──
  type Row =
    | { kind: 'title' }
    | { kind: 'field'; label: string; value: string }
    | { kind: 'sectionGap' }
    | { kind: 'itemsHeader' }
    | { kind: 'item'; name: string; meta: string; amount: string; subs: string[] }
    | { kind: 'notes'; lines: string[] }
    | { kind: 'rule' }
    | { kind: 'sumRow'; label: string; value: string; color: string }
    | { kind: 'total'; label: string; value: string };

  const rows: Row[] = [{ kind: 'title' }];

  const fields: { label: string; value: string }[] = [];
  if (data.customerName) fields.push({ label: 'לקוחה', value: data.customerName });
  if (data.deliveryType) fields.push({ label: 'סוג אספקה', value: data.deliveryType });
  const when = [data.deliveryDate, data.deliveryTime].filter(Boolean).join(' · ')
    + (data.deliveryFlexible ? ' (גמיש)' : '');
  if (when.trim()) fields.push({ label: 'מועד אספקה', value: when.trim() });
  if (data.address) fields.push({ label: 'כתובת', value: data.address });
  fields.forEach(f => rows.push({ kind: 'field', label: f.label, value: f.value }));

  if (data.items.length) {
    rows.push({ kind: 'sectionGap' });
    rows.push({ kind: 'itemsHeader' });
    for (const it of data.items) {
      rows.push({
        kind: 'item',
        name: it.name,
        meta: `${it.qty} × ${formatCurrency(it.lineTotal / (it.qty || 1))}`,
        amount: it.lineTotal < 0 ? `−${formatCurrency(Math.abs(it.lineTotal))}` : formatCurrency(it.lineTotal),
        subs: it.sub ?? [],
      });
    }
  }

  if (data.notes) {
    rows.push({ kind: 'sectionGap' });
    mctx.font = FONT(15);
    rows.push({ kind: 'notes', lines: wrapText(mctx, data.notes, CONTENT_W - 16) });
  }

  rows.push({ kind: 'rule' });
  if (data.discount && data.discount > 0) {
    rows.push({ kind: 'sumRow', label: data.discountLabel || 'הנחה', value: `−${formatCurrency(data.discount)}`, color: C.discount });
  }
  if (data.deliveryFee && data.deliveryFee > 0) {
    rows.push({ kind: 'sumRow', label: 'דמי משלוח', value: formatCurrency(data.deliveryFee), color: C.label });
  }
  rows.push({ kind: 'total', label: 'סה״כ לתשלום', value: formatCurrency(data.total) });

  // Height pass
  let h = PAD;
  for (const r of rows) {
    switch (r.kind) {
      case 'title': h += 78; break;
      case 'field': h += 34; break;
      case 'sectionGap': h += 14; break;
      case 'itemsHeader': h += 30; break;
      case 'item': h += 30 + r.subs.length * 20 + 8; break;
      case 'notes': h += 24 + r.lines.length * 22 + 8; break;
      case 'rule': h += 18; break;
      case 'sumRow': h += 30; break;
      case 'total': h += 56; break;
    }
  }
  h += PAD;

  // ── Real canvas ──
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(h) * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.scale(SCALE, SCALE);
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, C.bgTop);
  grad.addColorStop(1, C.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, h);

  // Right anchor for RTL labels/names, left anchor for amounts.
  const right = W - PAD;
  const left = PAD;

  let y = PAD;
  for (const r of rows) {
    switch (r.kind) {
      case 'title': {
        ctx.textAlign = 'right';
        ctx.fillStyle = C.brown;
        ctx.font = FONT(26, 'bold');
        ctx.fillText('סיכום הזמנה', right, y + 26);
        ctx.fillStyle = C.muted;
        ctx.font = FONT(16);
        ctx.fillText(`הזמנה ${data.orderNumber}`, right, y + 52);
        // thin divider under the title
        ctx.strokeStyle = C.borderStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y + 66);
        ctx.lineTo(right, y + 66);
        ctx.stroke();
        y += 78;
        break;
      }
      case 'field': {
        // label (right) + value (left), kept apart so a long value can't
        // overlap the label — the value is truncated to the free width.
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.font = FONT(13);
        const labelW = ctx.measureText(r.label).width;
        ctx.fillText(r.label, right, y + 14);
        ctx.fillStyle = C.dark;
        ctx.font = FONT(16);
        ctx.textAlign = 'left';
        ctx.fillText(truncate(ctx, r.value, CONTENT_W - labelW - 24), left, y + 14);
        y += 34;
        break;
      }
      case 'sectionGap':
        y += 14;
        break;
      case 'itemsHeader': {
        ctx.textAlign = 'right';
        ctx.fillStyle = C.brown;
        ctx.font = FONT(15, 'bold');
        ctx.fillText('פירוט הזמנה', right, y + 16);
        y += 30;
        break;
      }
      case 'item': {
        // amount (left) — measure first so the name can be truncated to fit.
        ctx.font = FONT(16, 'bold');
        const amountW = ctx.measureText(r.amount).width;
        ctx.textAlign = 'left';
        ctx.fillStyle = r.amount.startsWith('−') ? C.discount : C.brown;
        ctx.fillText(r.amount, left, y + 16);
        // name (right) — never allowed to run into the amount column.
        ctx.textAlign = 'right';
        ctx.fillStyle = C.dark;
        ctx.font = FONT(16, 'bold');
        ctx.fillText(truncate(ctx, r.name, CONTENT_W - amountW - 24), right, y + 16);
        // meta line (qty × unit price)
        ctx.textAlign = 'right';
        ctx.fillStyle = C.label;
        ctx.font = FONT(13);
        ctx.fillText(r.meta, right, y + 32);
        let sy = y + 30;
        for (const s of r.subs) {
          sy += 20;
          ctx.fillStyle = C.muted;
          ctx.font = FONT(13);
          ctx.textAlign = 'right';
          ctx.fillText(truncate(ctx, `• ${s}`, CONTENT_W - 12), right - 12, sy);
        }
        y += 30 + r.subs.length * 20 + 8;
        break;
      }
      case 'notes': {
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.font = FONT(13);
        ctx.fillText('הערות', right, y + 13);
        ctx.fillStyle = C.dark;
        ctx.font = FONT(15);
        let ny = y + 24;
        for (const line of r.lines) {
          ny += 22;
          ctx.fillText(line, right, ny);
        }
        y += 24 + r.lines.length * 22 + 8;
        break;
      }
      case 'rule': {
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y + 9);
        ctx.lineTo(right, y + 9);
        ctx.stroke();
        y += 18;
        break;
      }
      case 'sumRow': {
        ctx.textAlign = 'right';
        ctx.fillStyle = r.color;
        ctx.font = FONT(15);
        ctx.fillText(r.label, right, y + 16);
        ctx.textAlign = 'left';
        ctx.font = FONT(15);
        ctx.fillText(r.value, left, y + 16);
        y += 30;
        break;
      }
      case 'total': {
        // Rounded accent bar behind the total
        ctx.fillStyle = '#FBF1DD';
        const barY = y + 4;
        const barH = 40;
        const radius = 12;
        ctx.beginPath();
        ctx.moveTo(left + radius, barY);
        ctx.arcTo(right, barY, right, barY + barH, radius);
        ctx.arcTo(right, barY + barH, left, barY + barH, radius);
        ctx.arcTo(left, barY + barH, left, barY, radius);
        ctx.arcTo(left, barY, right, barY, radius);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = C.label;
        ctx.font = FONT(16, 'bold');
        ctx.fillText(r.label, right - 14, barY + 26);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.brown;
        ctx.font = FONT(22, 'bold');
        ctx.fillText(r.value, left + 14, barY + 27);
        y += 56;
        break;
      }
    }
  }

  // ── Export → download ──
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob-failed'))), 'image/png'),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Sanitise the order number for a valid filename across OSes while keeping
  // the required pattern: drop filesystem-reserved/control chars, turn
  // whitespace into underscores, collapse and trim stray separators. Normal
  // hyphens (e.g. "ORD-20250621-1234") are preserved.
  const safeNumber =
    (data.orderNumber || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-{2,}/g, '-')
      .replace(/^[.\-_]+|[.\-_]+$/g, '')
      .slice(0, 80)
    || 'order';
  a.download = `order-summary-${safeNumber}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
