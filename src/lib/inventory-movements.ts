// Stock-movement ledger writer. Every place in the codebase that mutates
// כמות_במלאי on מלאי_חומרי_גלם / מוצרים_למכירה / סוגי_פטיפורים should call
// recordStockMovement immediately after the update so the תנועות מלאי tab
// reflects what actually happened.
//
// Failures are intentionally swallowed (logged, not thrown). A movement
// insert is ledger-only: if it fails for any reason — table missing because
// migration 025 hasn't been run yet, transient DB hiccup — the underlying
// stock change has already happened and the user shouldn't see an error.
// Better to lose one log entry than to make a successful order look like a
// failed one in the UI.
//
// Sign convention: pass `before` and `after` from the actual stock numbers.
// We compute the magnitude (always positive) and pick movementKind:
//   • after > before → 'כניסה'
//   • after < before → 'יציאה'
//   • equal          → 'התאמה' (used when only thresholds changed, etc.)
// Callers can override movementKind explicitly when the inferred value is
// wrong (e.g. an explicit "set to N" that happens to land on the same value).

// Loose typing — the project's createAdminClient returns a SupabaseClient
// without a generated DB schema. We only need .from().insert() so a minimal
// shape is enough.
type MinimalSupabase = {
  from(table: string): {
    insert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
};

export type MovementItemKind = 'חומר_גלם' | 'מוצר' | 'פטיפור';
export type MovementKind = 'כניסה' | 'יציאה' | 'התאמה';
export type MovementSourceKind = 'הזמנה' | 'ידני' | 'מערכת';

export interface RecordMovementArgs {
  itemKind: MovementItemKind;
  itemId: string;
  itemName: string;
  before: number;
  after: number;
  sourceKind: MovementSourceKind;
  sourceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  // Optional override for the inferred movement kind.
  movementKind?: MovementKind;
}

export async function recordStockMovement(
  supabase: MinimalSupabase,
  args: RecordMovementArgs,
): Promise<void> {
  const before = Number(args.before) || 0;
  const after = Number(args.after) || 0;
  const delta = after - before;
  const magnitude = Math.abs(delta);

  const inferred: MovementKind =
    delta > 0 ? 'כניסה' :
    delta < 0 ? 'יציאה' :
    'התאמה';
  const movementKind = args.movementKind ?? inferred;

  try {
    const { error } = await supabase.from('תנועות_מלאי').insert({
      סוג_פריט: args.itemKind,
      מזהה_פריט: args.itemId,
      שם_פריט: args.itemName,
      סוג_תנועה: movementKind,
      כמות: magnitude,
      כמות_לפני: before,
      כמות_אחרי: after,
      סוג_מקור: args.sourceKind,
      מזהה_מקור: args.sourceId ?? null,
      הערות: args.notes ?? null,
      נוצר_על_ידי: args.createdBy ?? null,
    });
    if (error) {
      console.warn('[movement] insert failed (non-fatal):', error.message,
        '— item:', args.itemKind, args.itemId, 'before→after:', before, '→', after);
    }
  } catch (err) {
    console.warn('[movement] insert threw (non-fatal):',
      err instanceof Error ? err.message : err);
  }
}
