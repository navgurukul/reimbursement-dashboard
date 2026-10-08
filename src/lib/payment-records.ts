import supabase from "./supabase";
import { fetchVoucherMap } from "./expense-list";

/**
 * Helpers for the finance Records page.
 *
 * The page has two modes:
 *  - fast mode: the database returns only the rows on screen (this file's
 *    `fetchPaymentRecordsPage`);
 *  - full mode: every paid record is loaded once, for filters and exports.
 *
 * Both modes must show the same row at the same position, so they share one
 * ordering (`comparePaymentRecords`) and one enrichment step
 * (`enrichPaymentRecords`).
 */

/**
 * Microseconds since the epoch for a Postgres timestamp string, or null.
 * JavaScript Dates only keep milliseconds, but rows from the same payment
 * batch can differ by microseconds, and the database sorts on the full value.
 */
export const timestampMicros = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const match = text.match(/^(.*?T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$/);
  if (!match) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : ms * 1000;
  }
  const [, head, fraction = "", tail] = match;
  const ms = Date.parse(`${head}${tail}`);
  if (Number.isNaN(ms)) return null;
  const micros = Number((fraction + "000000").slice(0, 6));
  return ms * 1000 + micros;
};

const compareNullableNumbers = (a: number | null, b: number | null) => {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
};

const compareIds = (a: any, b: any) => {
  const x = String(a?.id || "");
  const y = String(b?.id || "");
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Display order of the Records table:
 *  1. rows without a paid time first, oldest created first;
 *  2. then by paid time, oldest first;
 *  3. within one payment batch (same paid time) by PD Row No.;
 *  4. then created time, then id.
 * `fetchPaymentRecordsPage` reproduces exactly this order in SQL.
 */
export function comparePaymentRecords(a: any, b: any): number {
  const aPaid = timestampMicros(a.paid_approval_time);
  const bPaid = timestampMicros(b.paid_approval_time);

  if (aPaid === null || bPaid === null) {
    if (aPaid === null && bPaid === null) {
      const byCreated = compareNullableNumbers(
        timestampMicros(a.created_at) ?? 0,
        timestampMicros(b.created_at) ?? 0
      );
      return byCreated !== 0 ? byCreated : compareIds(a, b);
    }
    return aPaid === null ? -1 : 1;
  }

  if (aPaid !== bPaid) return aPaid - bPaid;

  if (a.pd_row_no != null && b.pd_row_no != null && a.pd_row_no !== b.pd_row_no) {
    return a.pd_row_no - b.pd_row_no;
  }

  const byCreated = compareNullableNumbers(
    timestampMicros(a.created_at) ?? 0,
    timestampMicros(b.created_at) ?? 0
  );
  return byCreated !== 0 ? byCreated : compareIds(a, b);
}

/** Bank details keyed by every unique id they can be matched on. */
export type BankDetailsIndex = Map<string, any>;

export function buildBankDetailsIndex(bankData: any[] | null | undefined): BankDetailsIndex {
  const byUniqueId: BankDetailsIndex = new Map();
  (bankData ?? []).forEach((bankDetail: any) => {
    const uniqueId = String(bankDetail.unique_id || "").trim();
    const advanceUniqueId = String(bankDetail.advance_unique_id || "").trim();
    const directPaymentUniqueId = String(bankDetail.direct_payment_unique_id || "").trim();
    if (uniqueId) byUniqueId.set(uniqueId, bankDetail);
    if (advanceUniqueId) byUniqueId.set(advanceUniqueId, bankDetail);
    if (directPaymentUniqueId) byUniqueId.set(directPaymentUniqueId, bankDetail);
  });
  return byUniqueId;
}

/**
 * Add the fields the table and exports read: event title, voucher, bank
 * account holder and display Unique ID. Same rules the page has always used.
 * `bankIndex === null` means bank details could not be loaded.
 */
export function enrichPaymentRecords(
  rows: any[],
  ctx: {
    eventTitleMap: Record<string, string>;
    voucherMap: Record<string, any>;
    bankIndex: BankDetailsIndex | null;
  }
) {
  return rows.map((row: any) => {
    const r: any = {
      ...row,
      event_title: row.event_id ? ctx.eventTitleMap[row.event_id] || "N/A" : "N/A",
    };

    const voucher = ctx.voucherMap[row.id];
    if (voucher) {
      r.hasVoucher = true;
      r.voucherId = voucher.id;
    }

    if (!ctx.bankIndex) {
      r.unique_id = row.unique_id || "N/A";
      return r;
    }

    const matched = ctx.bankIndex.get(String(row.unique_id || "").trim()) || null;
    const matchedAccountHolder = matched?.account_holder || null;
    r.unique_id = row.unique_id || matched?.unique_id || "N/A";
    r.account_holder = matchedAccountHolder || null;
    r.beneficiary_name = matchedAccountHolder || "N/A";
    return r;
  });
}

/** Event titles for a set of event ids. */
export async function fetchEventTitles(eventIds: string[]) {
  const ids = [...new Set(eventIds.filter((id) => typeof id === "string" && id.length > 0))];
  const map: Record<string, string> = {};
  const list: { id: string; title: string }[] = [];
  if (ids.length === 0) return { map, list };
  const { data, error } = await supabase
    .from("expense_events")
    .select("id,title")
    .in("id", ids);
  if (!error && data) {
    data.forEach((ev: { id: string; title: string }) => {
      map[ev.id] = ev.title;
      list.push(ev);
    });
  }
  return { map, list };
}

/** All bank details (a few hundred rows), or null if they could not be read. */
export async function fetchBankDetailsIndex(): Promise<BankDetailsIndex | null> {
  const { data, error } = await supabase.from("bank_details").select("*");
  if (error) {
    console.error("Failed to load bank details:", error);
    return null;
  }
  return buildBankDetailsIndex(data);
}

/**
 * One page of paid records in display order, plus the total.
 *
 * The display order puts rows without a paid time first (ordered by created
 * time) and then everything else by paid time / PD Row No. A single SQL ORDER
 * BY cannot express "ignore PD Row No. only when paid time is empty", so the
 * list is read as two consecutive segments:
 *   A. paid_approval_time IS NULL      ORDER BY created_at, id
 *   B. paid_approval_time IS NOT NULL  ORDER BY paid_approval_time, pd_row_no NULLS LAST, created_at, id
 * and the requested page is cut from A, B, or the boundary between them.
 */
export async function fetchPaymentRecordsPage(params: {
  orgId: string;
  bank: string | null; // paid_by_bank value for a bank tab, or null for All
  page: number;
  pageSize: number;
}): Promise<{ rows: any[]; total: number; error: any }> {
  const { orgId, bank, page, pageSize } = params;

  const base = (opts?: { count?: boolean }) => {
    let q: any = supabase
      .from("expense_new")
      .select(opts?.count ? "id" : "*", opts?.count ? { count: "exact", head: true } : undefined)
      .eq("payment_status", "paid")
      .eq("org_id", orgId);
    if (bank) q = q.eq("paid_by_bank", bank);
    return q;
  };

  const [countA, countB] = await Promise.all([
    base({ count: true }).is("paid_approval_time", null),
    base({ count: true }).not("paid_approval_time", "is", null),
  ]);
  if (countA.error) return { rows: [], total: 0, error: countA.error };
  if (countB.error) return { rows: [], total: 0, error: countB.error };

  const totalA: number = countA.count ?? 0;
  const totalB: number = countB.count ?? 0;
  const total = totalA + totalB;

  const start = (Math.max(1, page) - 1) * pageSize;
  const end = Math.min(start + pageSize, total); // exclusive
  if (start >= end) return { rows: [], total, error: null };

  const requests: Promise<any>[] = [];
  if (start < totalA) {
    requests.push(
      base()
        .is("paid_approval_time", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(start, Math.min(end, totalA) - 1)
    );
  }
  if (end > totalA) {
    const fromB = Math.max(start, totalA) - totalA;
    const toB = end - totalA - 1;
    requests.push(
      base()
        .not("paid_approval_time", "is", null)
        .order("paid_approval_time", { ascending: true })
        .order("pd_row_no", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(fromB, toB)
    );
  }

  const results = await Promise.all(requests);
  const failed = results.find((r) => r.error);
  if (failed) return { rows: [], total, error: failed.error };

  const rows = results.flatMap((r) => r.data ?? []);
  return { rows, total, error: null };
}

/** Enrich one page of rows (events, vouchers, bank details). */
export async function enrichPaymentRecordsPage(
  rows: any[],
  bankIndex: BankDetailsIndex | null
) {
  const [{ map: eventTitleMap }, voucherMap] = await Promise.all([
    fetchEventTitles(rows.map((r) => r.event_id)),
    fetchVoucherMap(rows.map((r) => r.id)),
  ]);
  return enrichPaymentRecords(rows, { eventTitleMap, voucherMap, bankIndex });
}
