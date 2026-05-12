export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { parseIntent } from '@/lib/assistant/parser';
import { runIntent } from '@/lib/assistant/registry';
import type { AssistantResponse } from '@/lib/assistant/types';

// POST /api/assistant/ask
// Accepts free-text Hebrew, parses to a registry intent, dispatches a read-only action.
// Step 1: no DB writes, no emails, no confirmations.
// Optional `lastIntent` allows context-aware follow-ups ("רק הדחופות", "ומה עם ברקת").
const bodySchema = z.object({
  text: z.string().min(1).max(500),
  lastIntent: z.unknown().optional(),
});

function looksLikeIntent(x: unknown): x is import('@/lib/assistant/types').ParsedIntent {
  return !!x && typeof x === 'object' && 'type' in (x as Record<string, unknown>);
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json<AssistantResponse>({ kind: 'error', message: 'בקשה לא תקינה' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<AssistantResponse>({ kind: 'error', message: 'בקשה לא תקינה' }, { status: 400 });
  }

  try {
    const lastIntent = looksLikeIntent(parsed.data.lastIntent) ? parsed.data.lastIntent : undefined;
    const intent = parseIntent(parsed.data.text, lastIntent);
    const response = await runIntent(intent);
    return NextResponse.json<AssistantResponse>(response);
  } catch (err) {
    console.error('[assistant/ask] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json<AssistantResponse>(
      { kind: 'error', message: 'שגיאה בעיבוד הבקשה' },
      { status: 500 },
    );
  }
}
