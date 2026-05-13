export const dynamic = 'force-dynamic';

// Manual document issuance — the owner-driven replacement for the old
// status-trigger auto-create flow. The dashboard mark-paid + the order
// detail "+ הפק מסמך" modal both POST here.
//
// Body shape:
//   {
//     documentType: 'tax_invoice' | 'receipt' | 'invoice_receipt',
//     paymentMethod?: string,   // required for receipt + invoice_receipt
//     force?: boolean,          // bypass (הזמנה_id, סוג_מסמך) idempotency
//   }
//
// Validation:
//   - documentType must be one of the three known values.
//   - paymentMethod is required iff PAYMENT_DOCS includes documentType.
//   - paymentMethod must canonicalize to a value supported by the Edge
//     Function's PAYMENT_BUILDERS map. Unknown methods are rejected here
//     so the user gets a clear error instead of Morning silently rejecting
//     the document or labelling it under the wrong method.
//
// This route never writes to Supabase directly — it forwards the validated
// payload to the create-morning-invoice Edge Function and passes the
// response through to the caller.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// Document types that require a payment block. Mirrors PAYMENT_DOCS in the
// Edge Function — keep these two sets in sync.
const PAYMENT_DOCS = new Set<string>(['receipt', 'invoice_receipt']);

// Aliases → canonical PAYMENT_BUILDERS keys in the Edge Function. Lookup is
// case-insensitive for Latin-keyed entries; Hebrew keys are exact-match.
const PAYMENT_METHOD_ALIASES: Record<string, string> = {
  // canonical → canonical (identity)
  'מזומן':         'מזומן',
  'כרטיס אשראי':   'כרטיס אשראי',
  'העברה בנקאית':  'העברה בנקאית',
  'bit':           'bit',
  'PayBox':        'PayBox',
  'PayPal':        'PayPal',
  'המחאה':         'המחאה',
  // Hebrew aliases
  'אשראי':         'כרטיס אשראי',
  'ביט':           'bit',
  'צ\'ק':          'המחאה',
  'צק':            'המחאה',
  // Latin aliases (matched case-insensitively below)
  'credit_card':   'כרטיס אשראי',
  'creditcard':    'כרטיס אשראי',
  'card':          'כרטיס אשראי',
  'stripe':        'כרטיס אשראי',
  'payplus':       'כרטיס אשראי',
  'cash':          'מזומן',
  'bank transfer': 'העברה בנקאית',
  'bank_transfer': 'העברה בנקאית',
  'banktransfer':  'העברה בנקאית',
  'bacs':          'העברה בנקאית',
  'paybox':        'PayBox',
  'paypal':        'PayPal',
  'check':         'המחאה',
  'cheque':        'המחאה',
};

function canonicalizePaymentMethod(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (PAYMENT_METHOD_ALIASES[trimmed]) return PAYMENT_METHOD_ALIASES[trimmed];
  // Case-insensitive fallback for the Latin-keyed entries
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(PAYMENT_METHOD_ALIASES)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

const bodySchema = z.object({
  documentType: z.enum(['tax_invoice', 'receipt', 'invoice_receipt']),
  paymentMethod: z.string().optional(),
  force: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'נתונים לא תקינים' }, { status: 400 });
  }

  const { documentType, paymentMethod, force } = parsed.data;
  const orderId = params.id;

  // Validate the payment-method requirement before we wake up Morning.
  let canonicalMethod: string | null = null;
  if (PAYMENT_DOCS.has(documentType)) {
    if (!paymentMethod || !paymentMethod.trim()) {
      return NextResponse.json(
        { error: documentType === 'receipt'
            ? 'יש לבחור אמצעי תשלום לפני הפקת קבלה.'
            : 'יש לבחור אמצעי תשלום לפני הפקת חשבונית מס קבלה.' },
        { status: 400 },
      );
    }
    canonicalMethod = canonicalizePaymentMethod(paymentMethod);
    if (!canonicalMethod) {
      return NextResponse.json(
        { error: `אמצעי התשלום "${paymentMethod}" לא נתמך במיפוי. יש לבחור אמצעי תשלום אחר או לעדכן את המיפוי.` },
        { status: 400 },
      );
    }
  } else if (paymentMethod) {
    // tax_invoice doesn't carry a payment block; ignore but note in log
    // rather than reject so the UI can send the same shape for all 3 types.
    console.log('[manual-document] paymentMethod ignored for', documentType, '— tax invoice has no payment section');
  }

  console.log('[manual-document] order id:', orderId);
  console.log('[manual-document] requested document type:', documentType);
  // documentType passes through 1:1 to the Edge Function — no remapping —
  // but log it explicitly so any future translation layer is auditable.
  console.log('[manual-document] normalized document type:', documentType);
  console.log('[manual-document] morning document type:', { tax_invoice: 305, receipt: 400, invoice_receipt: 320 }[documentType]);
  console.log('[manual-document] raw payment method:', paymentMethod || 'none');
  console.log('[manual-document] mapped payment type:', canonicalMethod ?? 'n/a');
  console.log('[manual-document] force:', !!force);

  const supabaseUrl    = process.env.SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const webhookSecret  = process.env.WEBHOOK_SECRET ?? '';
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error('[manual-document] Missing env vars — SUPABASE_URL:', !!supabaseUrl, '| SERVICE_ROLE_KEY:', !!serviceRoleKey, '| WEBHOOK_SECRET:', !!webhookSecret);
    return NextResponse.json({ error: 'תצורת שרת חסרה — לא ניתן להפיק מסמך.' }, { status: 500 });
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-morning-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({
        // The Edge Function still expects the legacy webhook envelope shape.
        type: 'UPDATE',
        table: 'הזמנות',
        document_type: documentType,
        payment_method: canonicalMethod ?? undefined,
        force: !!force,
        record: { הזמנה_id: orderId },
        old_record: {},
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[manual-document] Morning failed:', res.status, JSON.stringify(body));
      return NextResponse.json(
        { error: body.error || `שגיאה בהפקת המסמך (HTTP ${res.status})` },
        { status: res.status >= 500 ? 502 : 400 },
      );
    }

    console.log('[manual-document] success:', JSON.stringify(body));
    return NextResponse.json({
      ok: true,
      ...body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[manual-document] Failed to call Morning:', message);
    return NextResponse.json({ error: `שגיאה בקריאה ל-Morning: ${message}` }, { status: 502 });
  }
}
