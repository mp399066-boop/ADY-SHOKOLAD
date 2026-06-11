export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { buildInvoicePdfResponse } from '@/lib/invoice-pdf-handler';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return buildInvoicePdfResponse(params.id);
}
