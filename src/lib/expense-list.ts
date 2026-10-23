import supabase from "./supabase";
import type { DatabaseError } from "./db";
import { fetchAllPagedRows, fetchAllPagedRowsParallel } from "./paged-fetch";

/**
 * Server-side paging for expense lists.
 *
 * The Expenses page used to download every expense the user could see (20k+
 * rows, ~25 MB) and then filter, count and page through them in the browser.
 * These helpers push all of that into the database: each call returns one
 * page of rows plus the total count, so the page loads in well under a second
 * however large the table grows.
 */

/** Which expenses a list shows. Mirrors the old per-role behaviour. */
export type ExpenseListScope =
  | "my" // expenses I created
  | "pending" // submitted expenses waiting for me to approve
  | "approver" // every expense where I am the approver (manager "All")
  | "org"; // every expense in the org (admin/owner "All")

export interface ExpenseListFilters {
  expenseType?: string;
  projectOfExpense?: string;
  status?: string;
  amountMin?: string;
  amountMax?: string;
  /** "ALL" | "SINGLE" | "CUSTOM" */
  dateMode?: string;
  /** YYYY-MM-DD */
  dateFrom?: string;
  /** YYYY-MM-DD */
  dateTo?: string;
  /** creator user_id */
  createdBy?: string;
  /** approver user_id */
  approver?: string;
  /** partial, case-insensitive match on unique_id */
  uniqueId?: string;
}

export interface ExpenseFilterOptions {
  expenseTypes: string[];
  locations: string[];
  statuses: string[];
  creators: { id: string; name: string }[];
  approvers: { id: string; name: string }[];
}

export interface ExpenseStatusCounts {
  total: number;
  approved: number;
  finance_approved: number;
  pending: number;
  rejected: number;
  finance_rejected: number;
}

// Row shape for the table. `*` is kept because the visible columns are
// configured per org (org_settings.expense_columns) and may name any column;
// at 10 rows per page the extra width costs nothing.
const LIST_SELECT = `
  *,
  creator:profiles!user_id ( full_name, email ),
  event:expense_events ( title )
`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toNumber = (value?: string) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Escape LIKE wildcards so user input is matched literally. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export function applyExpenseScope(
  query: any,
  scope: ExpenseListScope,
  orgId: string,
  userId: string
) {
  let q = query.eq("org_id", orgId);
  if (scope === "my") q = q.eq("user_id", userId);
  if (scope === "approver") q = q.eq("approver_id", userId);
  if (scope === "pending") q = q.eq("approver_id", userId).eq("status", "submitted");
  return q;
}

export function applyExpenseFilters(query: any, filters: ExpenseListFilters) {
  let q = query;
  if (filters.expenseType) q = q.eq("expense_type", filters.expenseType);
  if (filters.projectOfExpense) q = q.eq("location", filters.projectOfExpense);
  if (filters.status) q = q.eq("status", filters.status);

  const min = toNumber(filters.amountMin);
  const max = toNumber(filters.amountMax);
  if (min !== undefined) q = q.gte("amount", min);
  if (max !== undefined) q = q.lte("amount", max);

  if (filters.dateMode === "SINGLE" && filters.dateFrom) {
    q = q.eq("date", filters.dateFrom);
  } else if (filters.dateMode === "CUSTOM") {
    if (filters.dateFrom) q = q.gte("date", filters.dateFrom);
    if (filters.dateTo) q = q.lte("date", filters.dateTo);
  }

  // Ids only: values saved by the old page were names, which would make
  // Postgres reject the whole query.
  if (filters.createdBy && UUID_RE.test(filters.createdBy)) {
    q = q.eq("user_id", filters.createdBy);
  }
  if (filters.approver && UUID_RE.test(filters.approver)) {
    q = q.eq("approver_id", filters.approver);
  }

  const uid = filters.uniqueId?.trim();
  if (uid) q = q.ilike("unique_id", `%${escapeLike(uid)}%`);

  return q;
}

/** Run `fetch` over `ids` in chunks so the request URL stays short. */
export async function fetchByIdsInChunks<T>(
  ids: string[],
  fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = 150
): Promise<{ data: T[]; error: unknown }> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const { data, error } = await fetch(unique.slice(i, i + chunkSize));
    if (error) return { data: out, error };
    if (data) out.push(...data);
  }
  return { data: out, error: null };
}

/**
 * Vouchers for a set of expenses, keyed by expense_id. A single `.in()` with
 * thousands of ids builds a URL far beyond the gateway's limit and fails, so
 * the ids go in chunks.
 */
export async function fetchVoucherMap(expenseIds: string[]) {
  const { data, error } = await fetchByIdsInChunks<any>(expenseIds, (chunk) =>
    supabase.from("vouchers").select("*").in("expense_id", chunk)
  );
  if (error) console.error("Error fetching vouchers:", error);
  const map: Record<string, any> = {};
  data.forEach((v) => {
    map[v.expense_id] = v;
  });
  return map;
}

/**
 * Every voucher in the org, keyed by expense_id. For pages that show thousands
 * of expenses this is far cheaper than looking vouchers up by expense id: the
 * org has ~2k vouchers (2–3 requests) versus ~19k ids (100+ requests).
 * Every voucher row carries the same org_id as its expense.
 */
export async function fetchOrgVoucherMap(orgId: string) {
  const { data, error } = await fetchAllPagedRowsParallel<any>((from, to) =>
    supabase
      .from("vouchers")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (error) console.error("Error fetching vouchers:", error);
  const map: Record<string, any> = {};
  (data ?? []).forEach((v) => {
    map[v.expense_id] = v;
  });
  return map;
}

/** Approver display names for a set of user ids. */
async function fetchProfileNames(userIds: string[]) {
  const { data } = await fetchByIdsInChunks<{ user_id: string; full_name: string }>(
    userIds,
    (chunk) => supabase.from("profiles").select("user_id, full_name").in("user_id", chunk)
  );
  const map: Record<string, string> = {};
  data.forEach((p) => {
    map[p.user_id] = p.full_name;
  });
  return map;
}

/** Add approver, voucher and event fields the table and export expect. */
async function enrichRows(rows: any[], withVouchers: boolean) {
  if (rows.length === 0) return rows;
  const [approverNames, voucherMap] = await Promise.all([
    fetchProfileNames(rows.map((r) => r.approver_id)),
    withVouchers ? fetchVoucherMap(rows.map((r) => r.id)) : Promise.resolve({} as Record<string, any>),
  ]);

  return rows.map((row) => {
    const voucher = voucherMap[row.id];
    return {
      ...row,
      hasVoucher: Boolean(voucher),
      voucherId: voucher?.id,
      approver: {
        full_name:
          (row.approver_id && approverNames[row.approver_id]) ||
          row.approver_name ||
          "—",
        user_id: row.approver_id || voucher?.approver_id,
      },
      event_title: row.event?.title || "N/A",
    };
  });
}

/** One page of expenses plus the total number matching the filters. */
export async function fetchExpensePage(params: {
  orgId: string;
  userId: string;
  scope: ExpenseListScope;
  filters: ExpenseListFilters;
  page: number;
  pageSize: number;
}): Promise<{ data: any[]; count: number; error: DatabaseError | null }> {
  const { orgId, userId, scope, filters, page, pageSize } = params;
  const from = (Math.max(1, page) - 1) * pageSize;

  let query: any = supabase
    .from("expense_new")
    .select(LIST_SELECT, { count: "exact" });
  query = applyExpenseScope(query, scope, orgId, userId);
  query = applyExpenseFilters(query, filters);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) return { data: [], count: 0, error: error as DatabaseError };
  return { data: await enrichRows(data ?? [], true), count: count ?? 0, error: null };
}

/** Every expense matching the filters, for Export only. */
export async function fetchAllExpensesForExport(params: {
  orgId: string;
  userId: string;
  scope: ExpenseListScope;
  filters: ExpenseListFilters;
}) {
  const { orgId, userId, scope, filters } = params;
  const { data, error } = await fetchAllPagedRows<any>((from, to) => {
    let query: any = supabase.from("expense_new").select(LIST_SELECT);
    query = applyExpenseScope(query, scope, orgId, userId);
    query = applyExpenseFilters(query, filters);
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  if (error) return { data: null, error };
  return { data: await enrichRows(data, false), error: null };
}

/** The six stat-card numbers, counted by the database. */
export async function fetchExpenseStatusCounts(
  orgId: string,
  userId: string,
  scope: ExpenseListScope
): Promise<{ data: ExpenseStatusCounts | null; error: DatabaseError | null }> {
  const count = (status?: string) => {
    let query: any = supabase
      .from("expense_new")
      .select("id", { count: "exact", head: true });
    query = applyExpenseScope(query, scope, orgId, userId);
    if (status) query = query.eq("status", status);
    return query;
  };

  const results = await Promise.all([
    count(),
    count("approved"),
    count("finance_approved"),
    count("submitted"),
    count("rejected"),
    count("finance_rejected"),
  ]);
  const failed = results.find((r: any) => r.error);
  if (failed) return { data: null, error: failed.error as DatabaseError };

  const [total, approved, finance_approved, pending, rejected, finance_rejected] =
    results.map((r: any) => r.count ?? 0);
  return {
    data: { total, approved, finance_approved, pending, rejected, finance_rejected },
    error: null,
  };
}

/**
 * Values for the filter dropdowns. Uses the `get_expense_filter_options`
 * database function (one small response). If that function has not been
 * created yet, falls back to reading just the five small columns it needs.
 */
export async function fetchExpenseFilterOptions(
  orgId: string,
  userId: string,
  scope: ExpenseListScope
): Promise<ExpenseFilterOptions> {
  const { data, error } = await supabase.rpc("get_expense_filter_options", {
    p_org_id: orgId,
    p_scope: scope,
    p_user_id: userId,
  });

  if (!error && data) {
    return {
      expenseTypes: data.expense_types ?? [],
      locations: data.locations ?? [],
      statuses: data.statuses ?? [],
      creators: data.creators ?? [],
      approvers: data.approvers ?? [],
    };
  }

  console.warn(
    "get_expense_filter_options unavailable, using fallback:",
    (error as any)?.message
  );

  const { data: rows } = await fetchAllPagedRows<any>((from, to) => {
    let query: any = supabase
      .from("expense_new")
      .select("expense_type, location, status, user_id, approver_id");
    query = applyExpenseScope(query, scope, orgId, userId);
    return query.order("id", { ascending: true }).range(from, to);
  });
  const list = rows ?? [];

  const distinct = (values: any[]) =>
    [...new Set(values.filter((v) => v !== null && v !== undefined && String(v).trim() !== ""))]
      .map(String)
      .sort((a, b) => a.localeCompare(b));

  const creatorIds = distinct(list.map((r) => r.user_id));
  const approverIds = distinct(list.map((r) => r.approver_id));
  const names = await fetchProfileNames([...creatorIds, ...approverIds]);
  const people = (ids: string[]) =>
    ids
      .filter((id) => names[id])
      .map((id) => ({ id, name: names[id] }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    expenseTypes: distinct(list.map((r) => r.expense_type)),
    locations: distinct(list.map((r) => r.location)),
    statuses: distinct(list.map((r) => r.status)),
    creators: people(creatorIds),
    approvers: people(approverIds),
  };
}
