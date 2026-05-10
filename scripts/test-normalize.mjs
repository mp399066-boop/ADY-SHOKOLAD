// Mirror of src/lib/normalize.ts using only \uXXXX escapes for the
// punctuation classes — when literal chars are pasted into source they can
// silently form character ranges that erase Hebrew.
const APOSTROPHES = /[׳'ʼʻ`‘’]/g;
const QUOTES = /[״"“”]/g;
const ASTERISK = /\*/g;
const DASHES = /[‐-―−\-]/g;
const UNICODE_WHITESPACE = /[   -‍  　﻿]/g;
const SEPARATORS = /[_/\\,.;:!?()[\]{}<>]/g;

function normalizeSearchText(input) {
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
function matchesSearch(haystack, query) {
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

const cases = [
  ['מיני מגנום דובאי - פרווה', 'מיני', true],
  ["מיני מג' דובאי", 'מיני', true],
  ["מיני מג' דובאי", 'מג', true],
  ["מיני מג' דובאי", "מג'", true],
  ['מיני-מגנום', 'מיני', true],
  ['מיני-מגנום', 'מיני מגנום', true],
  ['מיני״מגנום', 'מיני', true],
  ['מיני * מגנום', 'מיני מגנום', true],
  ['מגנום', 'מיני', false],
  ['MINI Magnum', 'mini', true],
  ['MINI Magnum', 'magnum', true],
  ['  מיני   מגנום  ', 'מיני מגנום', true],
  ['פטיפור שוקולד', 'שוק', true],
  ['פטיפור שוקולד', 'בננה', false],
  ['מיני מגנום', 'מיני מגנום', true],   // NBSP
  ['מיני​מגנום', 'מיני מגנום', true],   // ZWSP
  ['פרודקט (1)', 'פרודקט', true],
  ['מיני מג׳ דובאי', 'מג', true],       // Hebrew geresh ׳
  ['מיני מג׳ דובאי', "מג'", true],
];
let pass = 0, fail = 0;
for (const [h, q, expected] of cases) {
  const got = matchesSearch(h, q);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'OK ' : 'FAIL'} match(${JSON.stringify(h)}, ${JSON.stringify(q)}) → ${got} (norm: ${JSON.stringify(normalizeSearchText(h))})`);
}
console.log(`---\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
