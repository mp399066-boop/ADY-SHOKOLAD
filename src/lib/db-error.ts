// ---------------------------------------------------------------------------
// Turning raw database errors into messages that are safe to show the user.
//
// Numbered migrations in this project are applied by hand in the Supabase SQL
// Editor, so there is always a window where the deployed code knows about a
// column the database doesn't have yet. PostgREST reports that as either a
// Postgres undefined_column (42703) or a schema-cache miss (PGRST204), whose
// raw English text means nothing to the operator. Map it to an actionable
// Hebrew line instead, and keep every other error out of this helper so real
// failures aren't disguised as "run the migration".
// ---------------------------------------------------------------------------

interface DbErrorLike {
  code?:    string | null;
  message?: string | null;
}

/**
 * Returns a user-facing message when `error` is a missing-column error,
 * or null when it's anything else (caller should handle it normally).
 */
export function missingColumnMessage(error: DbErrorLike | null | undefined): string | null {
  if (!error) return null;
  const message = error.message || '';
  const isMissingColumn =
    error.code === '42703' ||    // Postgres undefined_column
    error.code === 'PGRST204' || // PostgREST: column not in the schema cache
    (/column/i.test(message) && /(does not exist|not found|could not find)/i.test(message));
  if (!isMissingColumn) return null;

  const column = message.match(/["'`]([^"'`]+)["'`]/)?.[1];
  return column
    ? `השדה "${column}" עדיין לא קיים בבסיס הנתונים — יש להריץ את המיגרציה האחרונה ב-Supabase SQL Editor ואז לנסות שוב.`
    : 'שדה חסר בבסיס הנתונים — יש להריץ את המיגרציה האחרונה ב-Supabase SQL Editor ואז לנסות שוב.';
}
