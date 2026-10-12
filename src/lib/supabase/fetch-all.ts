// Supabase/PostgREST silently caps a response at 1,000 rows. For queries that
// must return EVERYTHING (full lists, totals) read page by page until a short
// page comes back. The query must have a stable order — end it with a unique
// column such as `.order('id')` — or rows can repeat/skip between pages.

const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  maxRows = 50_000,
): Promise<{ data: T[]; error: PageResult<T>['error'] }> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
