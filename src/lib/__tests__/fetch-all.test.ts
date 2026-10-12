import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '../supabase/fetch-all';

function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, calls };
}

describe('fetchAllPages', () => {
  it('reads past the 1,000-row cap', async () => {
    const t = fakeTable(2345);
    const { data, error } = await fetchAllPages(t.page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('exactly 1,000 rows needs one extra (empty) page to know it is done', async () => {
    const t = fakeTable(1000);
    expect((await fetchAllPages(t.page)).data).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it('stops and reports the error from a failing page', async () => {
    let n = 0;
    const res = await fetchAllPages(async () => {
      n++;
      return n === 1
        ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null }
        : { data: null, error: { message: 'boom' } };
    });
    expect(res.error?.message).toBe('boom');
    expect(res.data).toHaveLength(1000);
  });
});
