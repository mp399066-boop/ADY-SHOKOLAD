// Raw-material duplicate detection. Deliberately simple + safe — no AI,
// no fuzzy distance, no auto-merge. Just normalized string comparison so a
// human reviews every suggestion before anything is linked.

// Origin/brand "noise" words that don't distinguish one material from another.
// Kept conservative on purpose — type/colour words (לבן, מריר, dark, milk…)
// are NOT here, because removing them would wrongly match different materials.
const NOISE_WORDS = [
  'בלגי', 'יבוא', 'מיובא', 'איכותי', 'פרימיום',
  'callebaut', 'barry', 'premium', 'imported',
];

// trim → lowercase → collapse internal whitespace
export function normalizeName(name: string): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// normalized form with noise words removed (for the "similar after stripping" rule)
export function strippedName(name: string): string {
  const base = normalizeName(name);
  const kept = base
    .split(' ')
    .filter(w => w && !NOISE_WORDS.includes(w));
  return kept.join(' ').trim();
}

export interface DedupMaterial {
  id: string;
  name: string;
}

export interface DedupPair {
  primaryId: string;
  duplicateId: string;
  reason: string;
}

// Compare every pair once. Returns suggestions with the shorter (cleaner)
// normalized name chosen as the suggested primary. Pairs are ordered so the
// caller can dedupe by id-pair regardless of role.
export function findDuplicatePairs(materials: DedupMaterial[]): DedupPair[] {
  const out: DedupPair[] = [];

  for (let i = 0; i < materials.length; i++) {
    for (let j = i + 1; j < materials.length; j++) {
      const a = materials[i];
      const b = materials[j];
      const na = normalizeName(a.name);
      const nb = normalizeName(b.name);
      if (!na || !nb) continue;

      let reason: string | null = null;

      if (na === nb) {
        reason = 'שם זהה אחרי נירמול';
      } else if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) {
        reason = 'שם אחד מכיל את השני';
      } else {
        const sa = strippedName(a.name);
        const sb = strippedName(b.name);
        if (sa && sb && sa === sb && sa !== na) {
          reason = 'שמות זהים אחרי הסרת מילים נפוצות';
        }
      }

      if (!reason) continue;

      // Suggested primary = the shorter normalized name (the cleaner base);
      // tie-break on id for determinism.
      const aShorter = na.length < nb.length || (na.length === nb.length && a.id < b.id);
      const primary = aShorter ? a : b;
      const duplicate = aShorter ? b : a;
      out.push({ primaryId: primary.id, duplicateId: duplicate.id, reason });
    }
  }

  return out;
}

// Does a candidate name match an existing material or alias? Used for the
// "this material may already exist" warning when adding a new material.
export function nameMatches(candidate: string, existing: string): boolean {
  const c = normalizeName(candidate);
  const e = normalizeName(existing);
  if (!c || !e) return false;
  if (c === e) return true;
  if (c.length >= 3 && e.length >= 3 && (c.includes(e) || e.includes(c))) return true;
  const sc = strippedName(candidate);
  const se = strippedName(existing);
  return !!sc && !!se && sc === se;
}
