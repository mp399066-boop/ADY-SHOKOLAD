// Smoke tests for the entity resolver scoring logic.
// Run: npx tsx scripts/test-entity-resolver.ts
//
// Only the pure ranking helpers are exercised here — no Supabase. The DB
// fetcher (resolveEntity) is integration-tested manually after deploy.

import { rankCandidates, scoreOne } from '../src/lib/assistant/entity-resolver';
import type { ResolvedKind } from '../src/lib/assistant/types';

let pass = 0, fail = 0;

function check(label: string, ok: boolean, extra?: string) {
  if (ok) { pass++; console.log(`OK   ${label}`); }
  else    { fail++; console.log(`FAIL ${label}${extra ? ' — ' + extra : ''}`); }
}

// Fake catalog — mirrors the real shape but with synthetic IDs.
const fakeCatalog = [
  { kind: 'פטיפור'   as ResolvedKind, id: 'pf-1', rawName: 'פיסטוק',                    normalized: 'פיסטוק' },
  { kind: 'פטיפור'   as ResolvedKind, id: 'pf-2', rawName: 'שוהם',                       normalized: 'שוהם' },
  { kind: 'פטיפור'   as ResolvedKind, id: 'pf-3', rawName: 'ברקת',                       normalized: 'ברקת' },
  { kind: 'פטיפור'   as ResolvedKind, id: 'pf-4', rawName: 'ספיר',                       normalized: 'ספיר' },
  { kind: 'מוצר'     as ResolvedKind, id: 'p-1',  rawName: 'טארטלט פיסטוק',              normalized: 'טארטלט פיסטוק' },
  { kind: 'מוצר'     as ResolvedKind, id: 'p-2',  rawName: 'טארטלט שוקולד',              normalized: 'טארטלט שוקולד' },
  { kind: 'מוצר'     as ResolvedKind, id: 'p-3',  rawName: "מיני מג' דובאי",            normalized: 'מיני מג דובאי' },
  { kind: 'מוצר'     as ResolvedKind, id: 'p-4',  rawName: 'מיני מגנום דובאי - פרווה', normalized: 'מיני מגנום דובאי פרווה' },
  { kind: 'חומר_גלם' as ResolvedKind, id: 'r-1',  rawName: 'שוקולד מריר 70%',            normalized: 'שוקולד מריר 70%' },
  { kind: 'חומר_גלם' as ResolvedKind, id: 'r-2',  rawName: 'קמח לבן',                    normalized: 'קמח לבן' },
  { kind: 'מארז'     as ResolvedKind, id: 'pkg-1', rawName: 'מארז 36',                   normalized: 'מארז 36' },
  { kind: 'מארז'     as ResolvedKind, id: 'pkg-2', rawName: 'מארז 24',                   normalized: 'מארז 24' },
];

// ── 1. Pure scoreOne ──────────────────────────────────────────────────────
check('exact match → 1.0',          scoreOne('פיסטוק', 'פיסטוק') === 1.0);
check('prefix match → 0.85',         scoreOne('פיסט',   'פיסטוק שלם') === 0.85);
check('substring match → 0.65',      scoreOne('פיסטוק', 'טארטלט פיסטוק') === 0.65);
check('reverse-prefix → 0.55',       scoreOne('פיסטוקים', 'פיסטוק') === 0.55);
check('no overlap → 0',              scoreOne('בננה', 'פיסטוק') === 0);
check('empty query → 0',             scoreOne('', 'פיסטוק') === 0);
check('empty candidate → 0',         scoreOne('פיסטוק', '') === 0);

// ── 2. Single exact match ─────────────────────────────────────────────────
{
  const r = rankCandidates('שוהם', fakeCatalog);
  check('single exact match — best is correct', r.best?.id === 'pf-2');
  check('single exact match — quality is exact', r.quality === 'exact');
  check('single exact match — score 1.0',         r.best?.matchScore === 1.0);
}

// ── 3. Substring lifts a partial match ────────────────────────────────────
{
  const r = rankCandidates('פיסטוק', fakeCatalog);
  // Two candidates contain "פיסטוק": pf-1 ("פיסטוק") exact, p-1 ("טארטלט פיסטוק") substring.
  check('substring — exact wins',     r.best?.id === 'pf-1');
  check('substring — alternatives include partial', r.alternatives.some(a => a.id === 'p-1'));
}

// ── 4. Ambiguity ──────────────────────────────────────────────────────────
{
  const r = rankCandidates('מיני', fakeCatalog);
  // Two products start with "מיני": p-3 and p-4. Both prefix=0.85.
  check('ambiguous — flagged as ambiguous', r.quality === 'ambiguous');
  check('ambiguous — both alternatives present',
    r.alternatives.some(a => a.id === 'p-3') && r.alternatives.some(a => a.id === 'p-4'));
}

// ── 5. Hebrew normalization (geresh) ─────────────────────────────────────
{
  // "מג'" with apostrophe should match "מיני מג'" (normalized to "מיני מג")
  const r = rankCandidates("מג'", fakeCatalog);
  check("geresh-stripped query finds מיני מג' דובאי",
    r.alternatives.some(a => a.id === 'p-3'),
    `got ${JSON.stringify(r.alternatives.map(a => a.id))}`);
}

// ── 6. Package match ──────────────────────────────────────────────────────
{
  const r = rankCandidates('מארז 36', fakeCatalog);
  check('package — finds מארז 36 exactly',  r.best?.id === 'pkg-1');
  check('package — quality exact',          r.quality === 'exact');
}

// ── 7. No match ───────────────────────────────────────────────────────────
{
  const r = rankCandidates('בננה', fakeCatalog);
  check('no match — best is null',     r.best === null);
  check('no match — alternatives []',  r.alternatives.length === 0);
  check('no match — quality none',     r.quality === 'none');
}

// ── 8. Limit + minScore ───────────────────────────────────────────────────
{
  const r = rankCandidates('מ', fakeCatalog, { limit: 3 });
  check('limit honored — at most 3 alternatives', r.alternatives.length <= 3);
}
{
  const r = rankCandidates('פיסטוק', fakeCatalog, { minScore: 0.9 });
  // Only the exact "פיסטוק" should pass (score 1.0); the substring (0.65) drops.
  check('minScore filters out weak matches', r.alternatives.length === 1 && r.alternatives[0].id === 'pf-1');
}

// ── 9. Empty query ────────────────────────────────────────────────────────
{
  const r = rankCandidates('', fakeCatalog);
  check('empty query → quality none', r.quality === 'none');
}

// ── 10. Across kinds — exact wins regardless of kind ─────────────────────
{
  // "מיני מגנום דובאי - פרווה" → exact match should win.
  const r = rankCandidates('מיני מגנום דובאי - פרווה', fakeCatalog);
  check('full name exact across kinds — best is correct id', r.best?.id === 'p-4');
  check('full name — quality exact',                          r.quality === 'exact');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
