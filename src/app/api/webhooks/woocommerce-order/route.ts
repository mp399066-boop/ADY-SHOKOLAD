export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, route: 'woocommerce-order' });
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    console.log('[wc-webhook] RAW BODY:', text.slice(0, 500));
    console.log('[wc-webhook] Content-Type:', req.headers.get('content-type'));
    console.log('[wc-webhook] X-WC-Webhook-Topic:', req.headers.get('x-wc-webhook-topic'));
    console.log('[wc-webhook] X-WC-Webhook-Source:', req.headers.get('x-wc-webhook-source'));

    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      console.log('[wc-webhook] Invalid JSON — body is not parseable');
    }

    console.log('[wc-webhook] Parsed body keys:', Object.keys(body));

    return Response.json({ success: true });
  } catch (error) {
    console.error('[wc-webhook] Unexpected error:', error);
    return Response.json({ success: true });
  }
}
