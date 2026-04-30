export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, route: 'woocommerce-order' });
}

export async function POST(req: Request) {
  const body = await req.json();
  console.log('WooCommerce webhook:', body);

  return Response.json({ success: true });
}
