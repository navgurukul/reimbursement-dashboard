import type { DatabaseError } from "./db";

export const EXPENSE_PAGE_SIZE = 1000;

// Attempts per page, counting the first one.
const PAGE_MAX_ATTEMPTS = 4;
const PAGE_RETRY_BASE_DELAY_MS = 500;

/**
 * Postgres codes for a query that happened to fail, as opposed to one that
 * will fail every time it is sent.
 */
const TRANSIENT_PAGE_ERROR_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "57014", // query_canceled / statement_timeout
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
]);

export const isTransientPageError = (error: unknown) => {
  if (!error) return false;
  const code = String((error as { code?: unknown }).code ?? "").trim();
  // postgrest-js hands back a fetch-level failure as an ordinary result whose
  // message is the thrown error's name — "TypeError: Failed to fetch" — and
  // whose code is empty, and a gateway failure whose body is not JSON as a
  // bare `{ message }` with no code at all. Anything Postgres itself answered
  // carries a code (`42501` for RLS, `42P01` for an unknown table), so a
  // missing code means the query never got there and is worth another try.
  return code === "" || TRANSIENT_PAGE_ERROR_CODES.has(code);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch every row a query matches, one page at a time.
 *
 * A single PostgREST response is capped server-side (10,000 rows on this
 * project). Before the legacy import an org fitted comfortably under that, so
 * unpaginated `.select()` calls returned everything; afterwards they silently
 * returned only the first 10,000 and the UI filtered that truncated array,
 * showing confidently wrong lists, totals and exports.
 *
 * `build` must apply a deterministic sort. A sort on `created_at` alone is not
 * deterministic — imported rows share timestamps — and paging an unstable sort
 * skips and duplicates rows across page boundaries, so callers add `id` as a
 * tie-breaker.
 *
 * Reading one org's paid expenses now takes ~19 requests and ~26 MB, so a
 * single dropped connection used to abandon the whole read and report failure
 * for data that was almost entirely in hand — the "Failed to load records"
 * toast that appeared before a later attempt happened to succeed. Each page
 * gets a few attempts with backoff; an error Postgres itself returned is
 * final and is passed straight back without retrying.
 */
export async function fetchAllPagedRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<
  // Discriminated union so `if (error) return` narrows `data` to T[] at call
  // sites, matching how the Supabase client's own result type behaves.
  { data: T[]; error: null } | { data: null; error: DatabaseError }
> {
  const all: T[] = [];
  for (let from = 0; ; from += EXPENSE_PAGE_SIZE) {
    let page: T[] = [];
    let pageError: unknown = null;

    for (let attempt = 1; attempt <= PAGE_MAX_ATTEMPTS; attempt++) {
      let result: { data: T[] | null; error: unknown };
      try {
        result = await build(from, from + EXPENSE_PAGE_SIZE - 1);
      } catch (thrown) {
        // `build` normally resolves to { data, error }; a rejection still just
        // means this page never arrived.
        result = { data: null, error: thrown };
      }

      pageError = result.error ?? null;
      if (!pageError) {
        page = result.data ?? [];
        break;
      }
      if (attempt === PAGE_MAX_ATTEMPTS || !isTransientPageError(pageError)) {
        break;
      }
      await delay(PAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    if (pageError) return { data: null, error: pageError as DatabaseError };
    all.push(...page);
    if (page.length < EXPENSE_PAGE_SIZE) return { data: all, error: null };
  }
}

/**
 * Same result as `fetchAllPagedRows`, but requests several pages at once.
 *
 * The sequential version waits for page N before asking for page N+1, so a
 * 19-page read costs 19 round trips back to back. Here pages are requested in
 * waves of `concurrency`; the read stops at the first short page. Each page
 * keeps the same retry-with-backoff behaviour, and the rows come back in the
 * same order as the sequential version.
 */
export async function fetchAllPagedRowsParallel<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  concurrency = 5
): Promise<
  { data: T[]; error: null } | { data: null; error: DatabaseError }
> {
  const fetchPage = async (from: number) => {
    let pageError: unknown = null;
    for (let attempt = 1; attempt <= PAGE_MAX_ATTEMPTS; attempt++) {
      let result: { data: T[] | null; error: unknown };
      try {
        result = await build(from, from + EXPENSE_PAGE_SIZE - 1);
      } catch (thrown) {
        result = { data: null, error: thrown };
      }
      pageError = result.error ?? null;
      if (!pageError) return { page: result.data ?? [], error: null };
      if (attempt === PAGE_MAX_ATTEMPTS || !isTransientPageError(pageError)) break;
      await delay(PAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    return { page: [] as T[], error: pageError };
  };

  const all: T[] = [];
  for (let wave = 0; ; wave++) {
    const starts = Array.from(
      { length: concurrency },
      (_, i) => (wave * concurrency + i) * EXPENSE_PAGE_SIZE
    );
    const results = await Promise.all(starts.map(fetchPage));
    for (const { page, error } of results) {
      if (error) return { data: null, error: error as DatabaseError };
      all.push(...page);
      if (page.length < EXPENSE_PAGE_SIZE) return { data: all, error: null };
    }
  }
}
