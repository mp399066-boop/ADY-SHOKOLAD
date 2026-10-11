export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { buildInvoicePdfResponse } from '@/lib/invoice-pdf-handler';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return buildInvoicePdfResponse(params.id);
}
