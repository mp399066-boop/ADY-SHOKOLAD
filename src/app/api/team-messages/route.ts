// Internal team chat — kitchen workers ↔ Adi/manager.
// Auth: requireAuthorizedUser (any active authorized user; kitchen + management).
// DB access via service_role (createAdminClient) AFTER the auth gate — the
// team_messages table has RLS enabled with no anon/authenticated policies,
// so all reads/writes flow through this gated route. No service_role on client.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAuthorizedUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const MAX_LEN = 500;

export interface TeamMessage {
  id: string;
  sender_name: string | null;
  message: string;
  created_at: string;
}

// Friendly display name from an email local part (e.g. "adi.cohen" → "adi cohen").
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.replace(/[._-]+/g, ' ').trim() || email;
}

// GET — latest 30 messages, oldest→newest for chat display.
export async function GET() {
  const auth = await requireAuthorizedUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('team_messages')
    .select('id, sender_name, message, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[team-messages] GET failed', error.code);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }

  const messages = (data ?? []).reverse() as TeamMessage[];
  return NextResponse.json({ messages });
}

// POST — send a message. sender_name + created_by derived server-side from
// the authenticated user; client-provided values are ignored.
export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (!auth) return unauthorizedResponse();

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'empty_message' }, { status: 400 });
  }
  if (message.length > MAX_LEN) {
    return NextResponse.json({ error: 'too_long' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('team_messages')
    .insert({
      message,
      sender_name: nameFromEmail(auth.email),
      created_by: auth.id,
    })
    .select('id, sender_name, message, created_at')
    .single();

  if (error) {
    console.error('[team-messages] POST failed', error.code);
    return NextResponse.json({ error: 'send_failed' }, { status: 500 });
  }

  return NextResponse.json({ message: data as TeamMessage });
}
