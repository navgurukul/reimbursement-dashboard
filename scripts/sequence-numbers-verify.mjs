// Read-only. Reconstructs the PD Row No. / REF No. the Records tab showed
// before the 2026-09-02 legacy import, cross-checks them against the S.No.
// values "Mark as Advance" froze into custom_fields.original_serial_number,
// and, once the pd_row_no / bank_ref_no columns exist, compares them with the
// live values. Writes the expected numbers to outputs/sequence-numbers-expected.csv.
//
//   node scripts/sequence-numbers-verify.mjs [org-slug]     (default ng-payments)
import nextEnv from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const KEY = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.trim();
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const slug = process.argv[2] ?? "ng-payments";
const IMPORT_DAY = "2026-09-02T00:00:00Z";

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  const body = await r.text();
  if (!r.ok) {
    const err = new Error(`${path} -> ${r.status} ${body}`);
    try { err.code = JSON.parse(body).code; } catch {}
    throw err;
  }
  return JSON.parse(body);
}

const orgs = await rest(`organizations?slug=eq.${encodeURIComponent(slug)}&select=id,slug`);
if (!orgs.length) throw new Error(`org ${slug} not found`);
const orgId = orgs[0].id;

// Does the schema have the new columns yet?
let migrated = true;
try { await rest(`expense_new?select=pd_row_no,bank_ref_no,bank_ref_bank&limit=1`); }
catch (e) { if (e.code === "42703") migrated = false; else throw e; }

const cols = [
  "id", "created_at", "paid_approval_time", "paid_by_bank", "expense_type", "unique_id", "creator_email",
  "custom_fields->>legacy_source", "custom_fields->>marked_as_advance", "custom_fields->>original_serial_number",
  ...(migrated ? ["pd_row_no", "bank_ref_no", "bank_ref_bank"] : []),
].join(",");
const order = "order=paid_approval_time.asc.nullsfirst,created_at.asc,id.asc";
const rows = [];
for (let from = 0; ; from += 1000) {
  const page = await rest(`expense_new?select=${cols}&org_id=eq.${orgId}&payment_status=eq.paid&${order}&limit=1000&offset=${from}`);
  rows.push(...page);
  if (page.length < 1000) break;
}

// Exactly the Records tab's client-side comparator.
const t = (v) => (v ? new Date(v).getTime() : null);
rows.sort((a, b) => {
  const at = t(a.paid_approval_time), bt = t(b.paid_approval_time);
  if (at === null && bt === null) {
    const ac = t(a.created_at) ?? 0, bc = t(b.created_at) ?? 0;
    if (ac !== bc) return ac - bc;
    return String(a.id).localeCompare(String(b.id));
  }
  if (at === null) return -1;
  if (bt === null) return 1;
  if (at !== bt) return at - bt;
  const ac = t(a.created_at) ?? 0, bc = t(b.created_at) ?? 0;
  if (ac !== bc) return ac - bc;
  return String(a.id).localeCompare(String(b.id));
});

const isLegacy = (r) => r.expense_type === "Legacy Expense" || r.legacy_source != null;
const expected = new Map(); // id -> { pd, bank, ref }
let pd = 0;
const refCounters = new Map();
for (const r of rows) {
  const e = { pd: null, bank: null, ref: null };
  if (!isLegacy(r)) e.pd = ++pd;
  const bank = (r.paid_by_bank || "").trim();
  if (bank) {
    const n = (refCounters.get(bank) ?? 0) + 1;
    refCounters.set(bank, n);
    e.bank = bank; e.ref = n;
  }
  expected.set(r.id, e);
}

console.log(`org ${slug} ${orgId}`);
console.log(`paid rows ${rows.length}; legacy ${rows.filter(isLegacy).length}; app rows numbered 1..${pd}`);
console.log(`bank sequences:`, Object.fromEntries(refCounters));
const postImport = rows.filter((r) => !isLegacy(r) && r.paid_approval_time && r.paid_approval_time >= IMPORT_DAY);
console.log(`app rows paid on/after ${IMPORT_DAY.slice(0, 10)} (narrations may carry shifted numbers): ${postImport.length}` +
  (postImport.length ? `, PD Row No. ${expected.get(postImport[0].id).pd}..${expected.get(postImport.at(-1).id).pd}` : ""));

// Cross-check: numbers frozen by "Mark as Advance" before the import must equal the reconstruction.
const frozen = rows.filter((r) => r.marked_as_advance === "true" && r.original_serial_number != null);
let match = 0; const mismatch = [];
for (const r of frozen) {
  const want = expected.get(r.id).pd;
  const got = Number(r.original_serial_number);
  if (got === want) match++; else mismatch.push({ id: r.id, unique_id: r.unique_id, paid: r.paid_approval_time, frozen: got, reconstructed: want, legacy: isLegacy(r) });
}
console.log(`\nfrozen original_serial_number rows: ${frozen.length}; match reconstruction: ${match}; differ: ${mismatch.length}`);
const shifted = mismatch.filter((m) => m.frozen > pd);
if (mismatch.length) {
  console.log(`  of which frozen after the import (value > ${pd}, expected to differ): ${shifted.length}`);
  for (const m of mismatch.filter((x) => x.frozen <= pd).slice(0, 25)) console.log("  UNEXPLAINED", JSON.stringify(m));
}

// Compare with live columns.
if (!migrated) {
  console.log("\npd_row_no / bank_ref_no columns not present yet: migration not applied.");
} else {
  let pdOk = 0, pdBad = [], refOk = 0, refBad = [], appMissing = 0;
  for (const r of rows) {
    const e = expected.get(r.id);
    if (e.pd !== null && r.pd_row_no == null) appMissing++;
    if (r.pd_row_no != null) (r.pd_row_no === e.pd ? pdOk++ : pdBad.push({ id: r.id, live: r.pd_row_no, expected: e.pd }));
    if (r.bank_ref_no != null) ((r.bank_ref_no === e.ref && r.bank_ref_bank === e.bank) ? refOk++ : refBad.push({ id: r.id, live: [r.bank_ref_bank, r.bank_ref_no], expected: [e.bank, e.ref] }));
  }
  console.log(`\nlive pd_row_no: ${pdOk} match, ${pdBad.length} differ, ${appMissing} app rows unnumbered`);
  console.log(`live bank_ref_no: ${refOk} match, ${refBad.length} differ`);
  for (const b of pdBad.slice(0, 20)) console.log("  PD", JSON.stringify(b));
  for (const b of refBad.slice(0, 20)) console.log("  REF", JSON.stringify(b));
  const sample = rows.filter((r) => r.unique_id === "aarushi" && r.paid_approval_time?.startsWith("2026-08-21"));
  for (const r of sample) console.log(`  aarushi 2026-08-21: live PD ${r.pd_row_no} REF ${r.bank_ref_bank}/${r.bank_ref_no}; expected PD ${expected.get(r.id).pd} REF ${expected.get(r.id).ref}`);
}

mkdirSync("outputs", { recursive: true });
const csv = ["expense_id,unique_id,paid_approval_time,expected_pd_row_no,bank,expected_bank_ref_no",
  ...rows.map((r) => { const e = expected.get(r.id); return [r.id, JSON.stringify(r.unique_id ?? ""), r.paid_approval_time ?? "", e.pd ?? "", JSON.stringify(e.bank ?? ""), e.ref ?? ""].join(","); })].join("\n");
writeFileSync("outputs/sequence-numbers-expected.csv", csv);
console.log(`\nwrote outputs/sequence-numbers-expected.csv (${rows.length} rows)`);
