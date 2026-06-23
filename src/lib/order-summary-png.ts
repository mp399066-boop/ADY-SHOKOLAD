// Client-only order-summary image generator.
//
// Rasterises the EXACT customer order-summary email HTML (fetched from
// /api/orders/[id]/summary-image, which uses the same renderOrderEmail template
// the email itself uses) into a PNG entirely in the browser and triggers a
// download named order-summary-{orderNumber}.png for sharing on WhatsApp.
//
// Rendering uses html2canvas on an off-screen copy of the email markup, so the
// image is visually identical to the email the customer receives. Nothing is
// saved to Supabase. html2canvas is imported dynamically so it never enters the
// server/SSR bundle.

export interface OrderSummaryPngInput {
  /** Full email HTML document string (from renderOrderEmail). */
  html: string;
  orderNumber: string;
}

// Render width in CSS px — the email card is max-width 600 centred on a beige
// page with ~16px side padding, so 640 reproduces the email framing exactly.
const WIDTH = 640;
const SCALE = 2; // 2× bitmap for a crisp WhatsApp image
const PAGE_BG = '#F7F3EC'; // email page background

/**
 * Builds the PNG from the email HTML and triggers a browser download.
 * Throws on a missing canvas context or a rasterisation failure.
 */
export async function downloadOrderSummaryPng(input: OrderSummaryPngInput): Promise<void> {
  const { html, orderNumber } = input;

  // Strip any external <img> (e.g. a remote logo): an external image could
  // taint the canvas and make export fail. The email's text brand header
  // remains, which matches the email when no logo is configured.
  const safeHtml = html.replace(/<img\b[^>]*>/gi, '');

  // Off-screen host for the email markup. Positioned far off-screen (NOT
  // opacity/visibility hidden — html2canvas copies those and would render
  // blank). The outer email table carries the beige background itself.
  const holder = document.createElement('div');
  holder.setAttribute('dir', 'rtl');
  holder.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    `width:${WIDTH}px`,
    `background:${PAGE_BG}`,
    'font-family:Arial,Helvetica,sans-serif',
    'direction:rtl',
    'z-index:-2147483648',
  ].join(';');
  holder.innerHTML = safeHtml;
  document.body.appendChild(holder);

  try {
    // let layout settle before snapshotting
    await new Promise<void>(r => requestAnimationFrame(() => r()));

    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(holder, {
      backgroundColor: PAGE_BG,
      scale: SCALE,
      width: WIDTH,
      useCORS: true,
      logging: false,
    });

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob-failed'))), 'image/png'),
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Sanitise the order number for a valid filename across OSes; keep the
    // required pattern. Normal hyphens (e.g. "ORD-20250621-1234") are preserved.
    const safeNumber =
      (orderNumber || '')
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    holder.remove();
  }
}
