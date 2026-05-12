export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { parseIntent } from '@/lib/assistant/parser';
import { runIntent } from '@/lib/assistant/registry';
import type { AssistantResponse } from '@/lib/assistant/types';

// POST /api/assistant/ask
// Accepts free-text Hebrew, parses to a registry intent, dispatches a read-only action.
// Optional `context` (or legacy `lastIntent`) allows context-aware follow-ups
// like "רק הדחופות" / "ותשלחי במייל" / "אותו דבר למחר".
const bodySchema = z.object({
  text: z.string().min(1).max(500),
  // New shape — full ConversationContext from the client (5-min TTL applied
  // client-side before sending). Loose unknown so the schema doesn't have to
  // mirror every intent variant.
  context: z.unknown().optional(),
  // Legacy shape — older clients sent only the previous intent. Still accepted
  // so a stale browser tab doesn't break.
  lastIntent: z.unknown().optional(),
});

function looksLikeIntent(x: unknown): x is import('@/lib/assistant/types').ParsedIntent {
  return !!x && typeof x === 'object' && 'type' in (x as Record<string, unknown>);
}

function looksLikeContext(x: unknown): x is import('@/lib/assistant/types').ConversationContext {
  if (!x || typeof x !== 'object') return false;
  // A context object MAY have lastIntent; if it does, validate it. If it has
  // none of the known keys we treat it as no-context.
  const obj = x as Record<string, unknown>;
  const known = ['lastIntent', 'lastFilters', 'lastRange', 'lastAction', 'lastEntity', 'lastResultIds'];
  return known.some(k => k in obj);
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
    // Prefer the new context shape; fall back to legacy lastIntent so older
    // clients keep working through the rollout.
    const ctx = looksLikeContext(parsed.data.context)
      ? parsed.data.context
      : (looksLikeIntent(parsed.data.lastIntent) ? { lastIntent: parsed.data.lastIntent } : undefined);

    const intent = parseIntent(parsed.data.text, ctx);
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
