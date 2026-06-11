export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { buildInvoicePdfResponse } from '@/lib/invoice-pdf-handler';

// `.pdf`-looking alias of /api/orders/[id]/invoice-pdf. Same bytes, same
// headers — the only difference is the URL ends in `.pdf`, which lets a
// content-filtering proxy (NetFree) recognise the response as a downloadable
// file instead of blocking it. Reuses the exact server logic; no duplication.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return buildInvoicePdfResponse(params.id);
}
