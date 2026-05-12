// Entity resolver for the assistant. Given a free-text query like "פיסטוק"
// or "מארז 36", returns the matching row(s) from the four entity tables —
// petit fours, finished products, raw materials, packages — along with a
// match-quality classification so the caller can decide whether to act
// directly or surface alternatives.
//
// Pure-ish: the scoring helpers are pure functions; resolveEntity does
// fetch from Supabase. All Hebrew normalization goes through
// normalizeSearchText (src/lib/normalize.ts) which already strips geresh /
// gershayim / NBSP / hyphens / quotes.
//
// Phase 2.2 — used today by actionStockQuery. Phase 2.4 will extend it
// (inv_item_query, etc.) without changing this module's API.

import { normalizeSearchText } from '@/lib/normalize';
import type { ResolvedEntity, ResolvedKind, ResolveResult } from './types';

// Scoring thresholds. Tuned for short Hebrew product names.
const SCORE_EXACT     = 1.0;
const SCORE_PREFIX    = 0.85;
const SCORE_SUBSTRING = 0.65;
const SCORE_REVERSE   = 0.55;  // query starts with candidate — "פיסט" → "פיסטוק"
const DEFAULT_MIN_SCORE = 0.5;
const DEFAULT_LIMIT     = 5;

// Two scores are "tied" if they're within this margin — used to detect
// ambiguity vs a clear winner.
const TIE_MARGIN = 0.15;

interface Candidate {
  kind: ResolvedKind;
  id: string;
  rawName: string;
  normalized: string;
}

// Pure: score one candidate against a normalized query. Exposed for tests.
export function scoreOne(normalizedQuery: string, candidateNormalized: string): number {
  if (!normalizedQuery || !candidateNormalized) return 0;
  if (candidateNormalized === normalizedQuery)            return SCORE_EXACT;
  if (candidateNormalized.startsWith(normalizedQuery))    return SCORE_PREFIX;
  if (candidateNormalized.includes(normalizedQuery))      return SCORE_SUBSTRING;
  if (normalizedQuery.startsWith(candidateNormalized))    return SCORE_REVERSE;
  return 0;
}

// Pure: rank a list of candidates against the query. Exposed so tests can
// drive the scoring logic without spinning up Supabase.
export function rankCandidates(
  query: string,
  candidates: Candidate[],
  opts?: { minScore?: number; limit?: number },
): ResolveResult {
  const minScore = opts?.minScore ?? DEFAULT_MIN_SCORE;
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return { best: null, alternatives: [], quality: 'none' };
  }

  const scored = candidates
    .map(c => ({
      kind: c.kind,
      id: c.id,
      canonicalName: c.rawName,
      matchScore: scoreOne(normalizedQuery, c.normalized),
    }))
    .filter(s => s.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore);

  if (scored.length === 0) {
    return { best: null, alternatives: [], quality: 'none' };
  }

  const best = scored[0];
  const alternatives = scored.slice(0, limit);

  // Classify: exact wins outright; otherwise check whether more than one
  // candidate is within TIE_MARGIN of the top score (ambiguous).
  let quality: ResolveResult['quality'];
  if (best.matchScore >= SCORE_EXACT)              quality = 'exact';
  else if (best.matchScore >= SCORE_PREFIX)        quality = 'prefix';
  else                                             quality = 'substring';

  const tiedCount = scored.filter(s => best.matchScore - s.matchScore <= TIE_MARGIN).length;
  if (quality !== 'exact' && tiedCount > 1) {
    quality = 'ambiguous';
  }

  return { best, alternatives, quality };
}

// DB fetcher + ranker. The four tables are fetched in parallel; only ACTIVE
// rows participate so deactivated catalog entries don't surface.
//
// Note on table coverage: מארזים has no "active" flag identical to others —
// fetch all and let scoring filter. If a kind is excluded via opts.kinds,
// we skip its query entirely to keep latency tight.
//
// loose Supabase typing — the project's createAdminClient instance doesn't
// carry generated DB schema types. We only need .from().select() with simple
// filters.
type MinimalSupabase = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): { limit(n: number): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> };
      limit(n: number): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    };
  };
};

export interface ResolveOptions {
  kinds?: ResolvedKind[];
  minScore?: number;
  limit?: number;
  // Per-kind cap on rows fetched from Supabase before ranking. 200 is plenty
  // for catalogs of this size (~50 products, ~10 petit fours).
  fetchLimit?: number;
}

export async function resolveEntity(
  query: string,
  supabase: MinimalSupabase,
  opts?: ResolveOptions,
): Promise<ResolveResult> {
  if (!query || query.trim().length < 2) {
    return { best: null, alternatives: [], quality: 'none' };
  }

  const kinds = new Set(opts?.kinds ?? ['פטיפור', 'מוצר', 'חומר_גלם', 'מארז']);
  const fetchLimit = opts?.fetchLimit ?? 200;

  // Build per-kind queries only for kinds the caller cares about.
  type Fetch = Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
  const promises: Array<{ kind: ResolvedKind; nameField: string; promise: Fetch }> = [];

  if (kinds.has('פטיפור')) {
    promises.push({
      kind: 'פטיפור',
      nameField: 'שם_פטיפור',
      promise: supabase.from('סוגי_פטיפורים').select('id, שם_פטיפור').eq('פעיל', true).limit(fetchLimit),
    });
  }
  if (kinds.has('מוצר')) {
    promises.push({
      kind: 'מוצר',
      nameField: 'שם_מוצר',
      promise: supabase.from('מוצרים_למכירה').select('id, שם_מוצר').eq('פעיל', true).limit(fetchLimit),
    });
  }
  if (kinds.has('חומר_גלם')) {
    promises.push({
      kind: 'חומר_גלם',
      nameField: 'שם_חומר_גלם',
      // Raw materials don't have a פעיל flag — fetch all.
      promise: supabase.from('מלאי_חומרי_גלם').select('id, שם_חומר_גלם').limit(fetchLimit),
    });
  }
  if (kinds.has('מארז')) {
    promises.push({
      kind: 'מארז',
      nameField: 'שם_מארז',
      promise: supabase.from('מארזים').select('id, שם_מארז').eq('פעיל', true).limit(fetchLimit),
    });
  }

  const results = await Promise.all(promises.map(p => p.promise));

  const candidates: Candidate[] = [];
  for (let i = 0; i < results.length; i++) {
    const { kind, nameField } = promises[i];
    const { data, error } = results[i];
    if (error) {
      console.warn('[entity-resolver] fetch failed for', kind, error.message);
      continue;
    }
    for (const row of data ?? []) {
      const rawName = String(row[nameField] ?? '').trim();
      if (!rawName) continue;
      candidates.push({
        kind,
        id: String(row.id),
        rawName,
        normalized: normalizeSearchText(rawName),
      });
    }
  }

  return rankCandidates(query, candidates, { minScore: opts?.minScore, limit: opts?.limit });
}
