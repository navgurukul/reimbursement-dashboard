// Rewrites the "PD Row no. - X & REF NO. - Y" narrations in a Records-tab bank export
// (NG / FC / Kotak XLSX) with the persisted numbers in expense_new.pd_row_no /
// bank_ref_no. While migration 20260908000000 has not run yet, it uses the numbers
// the backfill will assign instead and labels the output "provisional".
//
//   node scripts/correct-export-narrations.mjs "<export.xlsx>" [--org ng-payments] [--bank "NGIDFC Current"]
//
// Read-only against the database. Writes to outputs/:
//   <name>__corrected-<final|provisional>.xlsx   same layout, narrations rewritten, plus a "Corrections" sheet
//   <name>__mapping-<final|provisional>.csv      old -> new numbers per voucher
import nextEnv from "@next/env";
import { createRequire } from "node:module";
import { basename, extname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) { console.error("usage: node scripts/correct-export-narrations.mjs <export.xlsx> [--org slug] [--bank name]"); process.exit(2); }
const slug = opt("--org", "ng-payments");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const KEY = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.trim();
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  const body = await r.text();
  if (!r.ok) { const e = new Error(`${path} -> ${r.status} ${body}`); try { e.code = JSON.parse(body).code; } catch {} throw e; }
  return JSON.parse(body);
}

// ---------------------------------------------------------------- export file
const VOUCHER_TYPE_TO_BANK = { "Expense IDFC": "NGIDFC Current", "Expense SBI FC": "FCIDFC Current", "Expense Kotak": "KOTAK" };
const NARR = /^Being paid to for (.*) PD Row no\. - (\S+) & REF NO\. - (\S+)\s*$/;
const wb = XLSX.readFile(file);
const sheetName = wb.SheetNames[0];
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
const header = aoa[0].map((h) => String(h));
const col = (needle, exact = false) => header.findIndex((h) => (exact ? h.toLowerCase() === needle.toLowerCase() : h.toLowerCase().includes(needle.toLowerCase())));
const C = { date: col("Voucher Date"), type: col("Voucher Type Name"), ledger: col("Ledger Name"), amount: col("Ledger Amount", true), drcr: col("Dr/Cr"), narr: col("Narration") };
for (const [k, v] of Object.entries(C)) if (v < 0) { console.error(`column for ${k} not found in header: ${header.join(" | ")}`); process.exit(2); }

const vouchers = [];
for (let i = 1; i < aoa.length; i++) {
  const row = aoa[i];
  if (String(row[C.date] ?? "").trim()) vouchers.push({ rowIndex: i, date: String(row[C.date]).trim(), type: String(row[C.type]).trim(), ledger: String(row[C.ledger]).trim(), amount: row[C.amount], narration: String(row[C.narr] ?? ""), lines: [i] });
  else if (vouchers.length) vouchers.at(-1).lines.push(i);
}
for (const v of vouchers) {
  const m = NARR.exec(v.narration);
  v.name = m ? m[1].trim() : null;
  v.oldPd = m ? m[2] : null;
  v.oldRef = m ? m[3] : null;
}
const types = [...new Set(vouchers.map((v) => v.type))];
const bank = opt("--bank", types.length === 1 ? VOUCHER_TYPE_TO_BANK[types[0]] : undefined);
if (!bank) { console.error(`cannot infer bank from voucher types ${JSON.stringify(types)}; pass --bank`); process.exit(2); }
console.log(`${basename(file)}: ${vouchers.length} vouchers, bank ${bank}, ${vouchers.filter((v) => !v.name).length} narrations not in the expected format`);

// ---------------------------------------------------------------- live data
const orgs = await rest(`organizations?slug=eq.${encodeURIComponent(slug)}&select=id`);
if (!orgs.length) { console.error(`org ${slug} not found`); process.exit(2); }
const orgId = orgs[0].id;
let migrated = true;
try { await rest(`expense_new?select=pd_row_no,bank_ref_no,bank_ref_bank&limit=1`); } catch (e) { if (e.code === "42703") migrated = false; else throw e; }

const cols = ["id", "created_at", "paid_approval_time", "paid_by_bank", "expense_type", "unique_id", "amount", "approved_amount", "actual_amount", "expense_credit_person",
  "payment_status", "custom_fields->>legacy_source", "custom_fields->>marked_as_advance", "custom_fields->>original_serial_number",
  ...(migrated ? ["pd_row_no", "bank_ref_no", "bank_ref_bank"] : [])].join(",");
async function fetchAll(filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const p = await rest(`expense_new?select=${cols}&org_id=eq.${orgId}&${filter}&order=paid_approval_time.asc.nullsfirst,created_at.asc,id.asc&limit=1000&offset=${from}`);
    out.push(...p); if (p.length < 1000) break;
  }
  return out;
}
const paid = await fetchAll("payment_status=eq.paid");
const ghosts = await fetchAll("paid_approval_time=not.is.null&or=(payment_status.neq.paid,payment_status.is.null)");
const bankDetails = await rest(`bank_details?select=unique_id,advance_unique_id,account_holder`);
const byUid = new Map();
for (const b of bankDetails) for (const k of [b.unique_id, b.advance_unique_id]) { const s = String(k || "").trim(); if (s) byUid.set(s, b); }

// Same order as the Records tab.
const t = (v) => (v ? new Date(v).getTime() : null);
const cmp = (a, b) => {
  const at = t(a.paid_approval_time), bt = t(b.paid_approval_time);
  if (at === null && bt === null) { const ac = t(a.created_at) ?? 0, bc = t(b.created_at) ?? 0; if (ac !== bc) return ac - bc; return String(a.id).localeCompare(String(b.id)); }
  if (at === null) return -1; if (bt === null) return 1; if (at !== bt) return at - bt;
  const ac = t(a.created_at) ?? 0, bc = t(b.created_at) ?? 0; if (ac !== bc) return ac - bc; return String(a.id).localeCompare(String(b.id));
};
const isLegacy = (r) => r.expense_type === "Legacy Expense" || r.legacy_source != null;
const ist = (v) => (v ? new Date(v).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-") : null);
paid.sort(cmp);
let pdN = 0; const refN = new Map();
for (const r of [...paid, ...ghosts]) {
  r.istDate = ist(r.paid_approval_time);
  r.beneficiary = byUid.get(String(r.unique_id || "").trim())?.account_holder || "N/A";
  r.creditPerson = String(r.expense_credit_person || "").trim();
}
for (const r of paid) {
  const bk = (r.paid_by_bank || "").trim();
  const posPd = isLegacy(r) ? null : ++pdN;
  const posRef = bk ? (refN.set(bk, (refN.get(bk) ?? 0) + 1), refN.get(bk)) : null;
  r.newPd = migrated ? (r.pd_row_no ?? null) : posPd;
  r.newRef = migrated ? (r.bank_ref_bank === bk ? (r.bank_ref_no ?? null) : null) : posRef;
}
const live = paid.filter((r) => (r.paid_by_bank || "") === bank);
console.log(`live: ${paid.length} paid rows, ${live.length} in ${bank}; numbers are ${migrated ? "FINAL (persisted columns)" : "PROVISIONAL (migration not applied yet)"}`);

// ---------------------------------------------------------------- match on content
const amt = (x) => { const n = Number(String(x ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n.toFixed(2) : null; };
const keyOf = (date, ledger, amount, name) => `${date}|${ledger}|${amount}|${String(name).trim().toLowerCase()}`;
const liveKeys = new Map();
const addKey = (k, r) => { if (!liveKeys.has(k)) liveKeys.set(k, []); liveKeys.get(k).push(r); };
for (const r of live) {
  const amounts = [...new Set([r.amount, r.approved_amount, r.actual_amount].map(amt).filter(Boolean))];
  const names = [...new Set([r.beneficiary, r.creditPerson].filter(Boolean))];
  for (const a of amounts) for (const n of names) addKey(keyOf(r.istDate, r.expense_type, a, n), r);
}
const refNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : Infinity);
const groups = new Map();
for (const v of vouchers) { if (!v.name) continue; const k = keyOf(v.date, v.ledger, amt(v.amount), v.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
const pairedIds = new Set();
for (const [k, vs] of groups) {
  const ls = [...new Set(liveKeys.get(k) ?? [])].filter((r) => !pairedIds.has(r.id)).sort(cmp);
  vs.sort((a, b) => refNum(a.oldRef) - refNum(b.oldRef));
  vs.forEach((v, i) => { if (ls[i]) { v.match = ls[i]; pairedIds.add(ls[i].id); } });
}
// Unmatched: look for the same payment elsewhere (removed, re-paid on another date, other bank).
for (const v of vouchers) {
  if (v.match || !v.name) continue;
  const a = amt(v.amount), n = v.name.toLowerCase();
  const same = (r) => r.expense_type === v.ledger && [r.amount, r.approved_amount, r.actual_amount].map(amt).includes(a) && [r.beneficiary, r.creditPerson].map((x) => String(x).toLowerCase()).includes(n);
  const cands = [...ghosts.filter(same).map((r) => ({ r, why: `record ${r.payment_status ?? "un-paid"} after payment on ${r.istDate}; no longer in Records` })),
    ...paid.filter((r) => same(r) && !pairedIds.has(r.id)).map((r) => ({ r, why: (r.paid_by_bank || "") !== bank ? `same payment now tagged ${r.paid_by_bank || "no bank"}` : `same payment now dated ${r.istDate} (re-paid)` }))];
  v.note = cands.length ? cands.map((c) => c.why).join("; ") : "no matching record found";
}

// ---------------------------------------------------------------- outputs
const out = aoa.map((row) => [...row]);
const corrections = [];
let corrected = 0, unchanged = 0, review = 0;
const pdDiff = {}, refDiff = {};
for (const v of vouchers) {
  const rec = { date: v.date, ledger: v.ledger, amount: v.amount, name: v.name ?? "", oldPd: v.oldPd ?? "", oldRef: v.oldRef ?? "", newPd: "", newRef: "", status: "", note: "" };
  if (!v.name) { rec.status = "needs review"; rec.note = "narration not in the PD Row no. / REF NO. format"; review++; }
  else if (!v.match) { rec.status = "needs review"; rec.note = v.note; review++; }
  else {
    const r = v.match;
    rec.newPd = r.newPd ?? "N/A"; rec.newRef = r.newRef ?? "N/A";
    if (r.newPd == null || r.newRef == null) { rec.status = "needs review"; rec.note = "record has no persisted number"; review++; }
    else {
      const narration = `Being paid to for ${v.name} PD Row no. - ${rec.newPd} & REF NO. - ${rec.newRef}`;
      if (narration === v.narration.trim()) { rec.status = "unchanged"; unchanged++; }
      else { out[v.rowIndex][C.narr] = narration; rec.status = "corrected"; corrected++; }
      if (Number.isFinite(Number(v.oldPd))) { const d = Number(v.oldPd) - r.newPd; pdDiff[d] = (pdDiff[d] ?? 0) + 1; }
      if (Number.isFinite(Number(v.oldRef))) { const d = Number(v.oldRef) - r.newRef; refDiff[d] = (refDiff[d] ?? 0) + 1; }
    }
  }
  corrections.push(rec);
}
const label = migrated ? "final" : "provisional";
const base = basename(file, extname(file));
mkdirSync("outputs", { recursive: true });
const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(out), sheetName);
const corrHeader = ["Voucher Date", "Ledger Name", "Ledger Amount", "Beneficiary", "Old PD Row No.", "Old REF No.", "New PD Row No.", "New REF No.", "Status", "Note"];
const corrRows = corrections.map((c) => [c.date, c.ledger, c.amount, c.name, c.oldPd, c.oldRef, c.newPd, c.newRef, c.status, c.note]);
XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet([corrHeader, ...corrRows]), "Corrections");
const xlsxPath = `outputs/${base}__corrected-${label}.xlsx`;
XLSX.writeFile(outWb, xlsxPath);
const csvPath = `outputs/${base}__mapping-${label}.csv`;
const q = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
writeFileSync(csvPath, [corrHeader.map(q).join(","), ...corrRows.map((r) => r.map(q).join(","))].join("\n"));

console.log(`\ncorrected ${corrected}, unchanged ${unchanged}, needs review ${review} (of ${vouchers.length})`);
console.log("old PD  - new PD :", pdDiff);
console.log("old REF - new REF:", refDiff);
for (const c of corrections.filter((c) => c.status === "needs review")) console.log(`  review: ${c.date} | ${c.ledger} | ${c.amount} | ${c.name} | PD ${c.oldPd} REF ${c.oldRef} -> ${c.note}`);
console.log(`\nwrote ${xlsxPath}\nwrote ${csvPath}`);
