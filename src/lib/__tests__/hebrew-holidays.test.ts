import { describe, expect, it } from 'vitest';
import { holidayDef, holidayDatesInYear, holidaySeason, holidayWindow, upcomingHolidays, addDays } from '@/lib/hebrew-holidays';

const def = (k: string) => holidayDef(k)!;

describe('holidayDatesInYear', () => {
  it('finds Rosh Hashana', () => {
    expect(holidayDatesInYear(def('rosh_hashana'), 2025)).toEqual(['2025-09-23']);
    expect(holidayDatesInYear(def('rosh_hashana'), 2026)).toEqual(['2026-09-12']);
  });
  it('finds Pesach', () => {
    expect(holidayDatesInYear(def('pesach'), 2026)).toEqual(['2026-04-02']);
  });
  it('puts Purim in Adar II in a leap year', () => {
    expect(holidayDatesInYear(def('purim'), 2026)).toEqual(['2026-03-03']);
    expect(holidayDatesInYear(def('purim'), 2027)).toEqual(['2027-03-23']);
  });
  it('finds Hanukkah', () => {
    expect(holidayDatesInYear(def('hanukkah'), 2026)).toEqual(['2026-12-05']);
  });
});

describe('holidaySeason', () => {
  it('gives the next holiday and the one a year before', () => {
    expect(holidaySeason(def('pesach'), '2026-10-13')).toEqual({ current: '2027-04-22', previous: '2026-04-02' });
  });
  it('keeps a holiday that just passed as the current season', () => {
    expect(holidaySeason(def('rosh_hashana'), '2026-09-15')).toEqual({ current: '2026-09-12', previous: '2025-09-23' });
  });
});

describe('helpers', () => {
  it('builds the window before a holiday', () => {
    expect(holidayWindow('2026-09-12', 21)).toEqual({ from: '2026-08-22', to: '2026-09-12' });
  });
  it('adds days across months', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('orders upcoming holidays by date', () => {
    const list = upcomingHolidays('2026-10-13');
    expect(list[0]).toMatchObject({ key: 'hanukkah', date: '2026-12-05' });
    expect(list.map(h => h.date)).toEqual([...list.map(h => h.date)].sort());
  });
});
