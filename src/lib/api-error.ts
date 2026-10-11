import { NextResponse } from 'next/server';
import { missingColumnMessage } from '@/lib/db-error';

// ---------------------------------------------------------------------------
// The one way an API route answers a failed database call. Raw PostgREST /
// Postgres messages name tables, columns and constraints, so they go to the
// server log only (route + code, never row data) and the client gets Hebrew.
// ---------------------------------------------------------------------------

interface DbErrorLike {
  code?:    string | null;
  message?: string | null;
}

export function dbErrorResponse(error: DbErrorLike | null | undefined, route: string): NextResponse {
  console.error(`[${route}] db error`, { code: error?.code ?? null, message: error?.message ?? null });
  const missing = missingColumnMessage(error);
  return NextResponse.json(
    { error: missing ?? 'אירעה שגיאה בשמירה או בטעינת הנתונים. נסו שוב, ואם זה חוזר — פנו לתמיכה.', code: error?.code ?? null },
    { status: 500 },
  );
}

// Same as dbErrorResponse, keeping a Hebrew lead-in that tells the user which
// step failed ("יצירת הזמנה נכשלה") without the raw database text after it.
export function dbStepErrorResponse(error: DbErrorLike | null | undefined, route: string, step: string): NextResponse {
  console.error(`[${route}] db error`, { step, code: error?.code ?? null, message: error?.message ?? null });
  const missing = missingColumnMessage(error);
  return NextResponse.json({ error: missing ?? `${step}. נסו שוב, ואם זה חוזר — פנו לתמיכה.`, code: error?.code ?? null }, { status: 500 });
}

// Catch-all for unexpected exceptions in a route: log the real error, show a
// generic Hebrew message.
export function serverErrorResponse(err: unknown, route: string): NextResponse {
  console.error(`[${route}] unexpected error`, { message: err instanceof Error ? err.message : String(err) });
  return NextResponse.json({ error: 'שגיאת שרת. נסו שוב, ואם זה חוזר — פנו לתמיכה.' }, { status: 500 });
}

// For messages built inline around a db error (per-row import results, multi-
// step deletes): logs the full error and returns a short safe tail to show.
export function dbErrorDetail(error: DbErrorLike | null | undefined, route: string): string {
  console.error(`[${route}] db error`, { code: error?.code ?? null, message: error?.message ?? null });
  return missingColumnMessage(error) ?? `קוד שגיאה ${error?.code ?? 'לא ידוע'}`;
}
