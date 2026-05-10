// Hebrew/English-aware search normalization.
// Used by Combobox to match user queries against option text in a way that is
// tolerant of punctuation variants (Hebrew geresh ׳ vs ASCII apostrophe ',
// Hebrew gershayim ״ vs ASCII double-quote ", asterisks from price lists, en/em
// dashes vs hyphen, accidental double spaces, NFC vs NFD).
//
// All character classes use \uXXXX escapes — do NOT inline literal punctuation.
// Pasting characters like en-dash or NBSP into the source can produce ranges
// that silently span the entire Hebrew block (U+0590–U+05FF) and erase the
// very text we are trying to match.
const APOSTROPHES = /[׳'ʼʻ`‘’]/g;          // ׳ ' ʼ ʻ ` ' '
const QUOTES = /[״"“”]/g;                            // ״ " " "
const ASTERISK = /\*/g;
// Replace dashes with a space so "מיני-מגנום" reads like "מיני מגנום"
const DASHES = /[‐-―−\-]/g;                          // hyphen variants + minus
// Replace various unicode whitespace and zero-width chars with a regular space
const UNICODE_WHITESPACE = /[   -‍  　﻿]/g;
// Misc punctuation we treat as separators
const SEPARATORS = /[_/\\,.;:!?()[\]{}<>]/g;

export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(QUOTES, '')
    .replace(ASTERISK, '')
    .replace(UNICODE_WHITESPACE, ' ')
    .replace(DASHES, ' ')
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// All-tokens substring match: every whitespace-separated token in `query` must
// appear (as a substring) in `haystack`. Both inputs are normalized first.
// Returns true on empty query so callers don't have to special-case it.
export function matchesSearch(haystack: string | null | undefined, query: string | null | undefined): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const h = normalizeSearchText(haystack);
  if (!h) return false;
  for (const tok of q.split(' ')) {
    if (!tok) continue;
    if (!h.includes(tok)) return false;
  }
  return true;
}
