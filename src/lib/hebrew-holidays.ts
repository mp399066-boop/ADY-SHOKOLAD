// Jewish holidays → Gregorian dates, from the runtime's built-in Hebrew
// calendar (Intl, ca-hebrew). No external data, so it keeps working every year.
//
// Used by /sales "חגים": compare the weeks before a holiday last year with the
// same weeks before it this year.

export type HolidayKey = 'rosh_hashana' | 'sukkot' | 'hanukkah' | 'tu_bishvat' | 'purim' | 'pesach' | 'shavuot';

export interface HolidayDef {
  key: HolidayKey;
  label: string;
  /** Hebrew month name as Intl prints it in English ("Tishri", "Nisan" …). */
  month: string;
  day: number;
}

export const HOLIDAYS: HolidayDef[] = [
  { key: 'rosh_hashana', label: 'ראש השנה', month: 'Tishri', day: 1 },
  { key: 'sukkot', label: 'סוכות', month: 'Tishri', day: 15 },
  { key: 'hanukkah', label: 'חנוכה', month: 'Kislev', day: 25 },
  { key: 'tu_bishvat', label: 'ט״ו בשבט', month: 'Shevat', day: 15 },
  // In a leap year Purim is in Adar II — handled in hebrewParts().
  { key: 'purim', label: 'פורים', month: 'Adar', day: 14 },
  { key: 'pesach', label: 'פסח', month: 'Nisan', day: 15 },
  { key: 'shavuot', label: 'שבועות', month: 'Sivan', day: 6 },
];

export function holidayDef(key: string): HolidayDef | undefined {
  return HOLIDAYS.find(h => h.key === key);
}

const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' });

function hebrewParts(iso: string): { month: string; day: number } {
  const parts = fmt.formatToParts(new Date(`${iso}T12:00:00Z`));
  const month = parts.find(p => p.type === 'month')?.value ?? '';
  const day = Number(parts.find(p => p.type === 'day')?.value);
  // "Adar II" (leap year) is the Adar of Purim; "Adar I" is not.
  return { month: month === 'Adar II' ? 'Adar' : month === 'Adar I' ? 'Adar I' : month, day };
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const datesCache = new Map<string, string[]>();

/** All dates of a holiday that fall in a Gregorian year (usually one). */
export function holidayDatesInYear(def: HolidayDef, year: number): string[] {
  const cacheKey = `${def.key}|${year}`;
  const hit = datesCache.get(cacheKey);
  if (hit) return hit;
  const out: string[] = [];
  for (let iso = `${year}-01-01`; iso <= `${year}-12-31`; iso = addDays(iso, 1)) {
    const p = hebrewParts(iso);
    if (p.month === def.month && p.day === def.day) out.push(iso);
  }
  datesCache.set(cacheKey, out);
  return out;
}

/**
 * The next occurrence of the holiday on/after `today` and the one before it
 * (≈ a year earlier). A holiday that was within the last `graceDays` still
 * counts as "this season" so the page keeps showing it right after the date.
 */
export function holidaySeason(def: HolidayDef, today: string, graceDays = 7): { current: string; previous: string } {
  const year = Number(today.slice(0, 4));
  const all = [year - 2, year - 1, year, year + 1].flatMap(y => holidayDatesInYear(def, y)).sort();
  const from = addDays(today, -graceDays);
  const idx = all.findIndex(d => d >= from);
  const i = idx === -1 ? all.length - 1 : idx;
  return { current: all[i], previous: all[Math.max(0, i - 1)] };
}

/** The window of delivery dates that "belongs" to a holiday: N days up to the holiday itself. */
export function holidayWindow(holiday: string, daysBefore: number): { from: string; to: string } {
  return { from: addDays(holiday, -daysBefore), to: holiday };
}

/** The upcoming holidays ordered by date, for the picker. */
export function upcomingHolidays(today: string): { key: HolidayKey; label: string; date: string }[] {
  return HOLIDAYS
    .map(h => ({ key: h.key, label: h.label, date: holidaySeason(h, today).current }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
