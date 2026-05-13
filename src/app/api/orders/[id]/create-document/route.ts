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
import { createAdminClient } from '@/lib/supabase/server';
import { isServiceEnabled, logServiceRun, SERVICE_DISABLED_MESSAGE } from '@/lib/system-services';

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
  // Provenance marker. The PaymentMethodModal sends `'manual_modal'` so
  // we can prove (later in the chain + at the EF) that the method was
  // typed/picked by a human in this session — and isn't a leftover from
  // order.אופן_תשלום, WC, or any other non-explicit source. PAYMENT_DOCS
  // require this literal exactly; missing/wrong value = 400.
  paymentMethodSource: z.literal('manual_modal').optional(),
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

  const { documentType, paymentMethod, paymentMethodSource, force } = parsed.data;
  const orderId = params.id;

  // ── CONTROL CENTER GATE ────────────────────────────────────────────────
  // Admin can pause document issuance entirely from /settings/system-control.
  // Runs first — before the provenance gate, before Morning — so the operator
  // gets a clear "service is off" message instead of a confusing payment-method
  // refusal.
  {
    const supabaseAdmin = createAdminClient();
    if (!(await isServiceEnabled(supabaseAdmin, 'morning_documents'))) {
      console.log('[PAYMENT API] morning_documents is OFF — aborting before Morning call. order:', orderId);
      await logServiceRun(supabaseAdmin, {
        serviceKey:  'morning_documents',
        action:      `issue_${documentType}`,
        status:      'disabled',
        relatedType: 'order',
        relatedId:   orderId,
        message:     'document NOT issued — service disabled in control center',
      });
      return NextResponse.json({ error: SERVICE_DISABLED_MESSAGE }, { status: 503 });
    }
  }

  // ── PROVENANCE GATE ────────────────────────────────────────────────────
  // PAYMENT_DOCS may only be issued when the request carries the explicit
  // `paymentMethodSource: 'manual_modal'` marker. Anything else (an old
  // browser still sending the pre-fix body, a custom client, or a
  // re-played webhook) is refused before we touch Morning.
  if (PAYMENT_DOCS.has(documentType) && paymentMethodSource !== 'manual_modal') {
    console.error('[PAYMENT API] REFUSE — PAYMENT_DOC issuance without paymentMethodSource=manual_modal',
      '| documentType:', documentType,
      '| received source:', JSON.stringify(paymentMethodSource ?? null));
    return NextResponse.json(
      {
        error: 'הפקת קבלה / חשבונית מס קבלה מותרת רק דרך מודאל ההפקה הידני. רעני את הדף ונסי שוב.',
      },
      { status: 400 },
    );
  }

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

  // ── HARD TRACE ─────────────────────────────────────────────────────────
  // Every PAYMENT_DOC issuance writes this block in one place so it's easy
  // to grep in Vercel logs. If a doc came out wrong, the trace makes the
  // who-sent-what unambiguous.
  console.log('[PAYMENT API] route: /api/orders/[id]/create-document');
  console.log('[PAYMENT API] order id:', orderId);
  console.log('[PAYMENT API] documentType:', documentType);
  console.log('[PAYMENT API] morning document type code:', { tax_invoice: 305, receipt: 400, invoice_receipt: 320 }[documentType]);
  console.log('[PAYMENT API] requires payment block:', PAYMENT_DOCS.has(documentType));
  console.log('[PAYMENT API] paymentMethod from body:', JSON.stringify(paymentMethod ?? null));
  console.log('[PAYMENT API] paymentMethodSource:', JSON.stringify(paymentMethodSource ?? null));
  console.log('[PAYMENT API] canonical method:', JSON.stringify(canonicalMethod));
  console.log('[PAYMENT API] forwarding to EF — payment_method:', JSON.stringify(canonicalMethod), '| payment_method_source:', JSON.stringify(paymentMethodSource ?? null));
  console.log('[PAYMENT API] force:', !!force);
  // Defensive belt-and-suspenders. The schema + canonicalization above
  // already guarantees this for PAYMENT_DOCS, but a final assertion makes
  // it impossible to ever forward a PAYMENT_DOC without a method — even if
  // the validation block above is later refactored.
  if (PAYMENT_DOCS.has(documentType) && !canonicalMethod) {
    console.error('[manual-document] refusing — PAYMENT_DOC without canonical method (should be unreachable)');
    return NextResponse.json(
      { error: 'יש לבחור אמצעי תשלום תקין לפני הפקת המסמך.' },
      { status: 400 },
    );
  }

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
        // Forward the provenance marker so the EF can re-validate. PAYMENT_DOCS
        // without this exact value will be rejected at the EF layer too —
        // belt-and-suspenders against a future caller that bypasses this route.
        payment_method_source: paymentMethodSource ?? undefined,
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
