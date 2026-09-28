-- One-time backfill of pd_row_no / bank_ref_no. Run once, after
-- 20260908000000_persist_payment_sequence_numbers.sql.
--
-- Reconstructs the numbers the Records tab showed before the 2026-09-02
-- legacy import, in the tab's own sort order (paid_approval_time asc, nulls
-- first; then created_at; then id):
--   PD Row No. = position among paid rows that are not legacy-import rows
--   REF No.    = position among paid rows tagged with the same bank
-- Legacy-import rows get no PD Row No.; finance never numbered them in the app.
-- Rows paid after the import (2026-09-02 onwards) simply continue the
-- sequence, so a narration exported for one of them in the days after the
-- import carries the shifted number and needs a manual correction.
--
-- Verify after applying with: node scripts/sequence-numbers-verify.mjs


do $$
begin
  if exists (select 1 from public.expense_new where pd_row_no is not null or bank_ref_no is not null) then
    raise exception 'expense_new already has sequence numbers; this backfill is one-time';
  end if;
end;
$$;

-- handle_updated_at would stamp every paid row with today's date, and the
-- Records "Timestamp" column renders updated_at. Keep it out of this rewrite.
-- The trigger is in the repo's migrations but live rows suggest production
-- never got it (updated_at older than paid_approval_time), so toggle it only
-- if it exists rather than failing the whole backfill.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'handle_updated_at' and tgrelid = 'public.expense_new'::regclass) then
    execute 'alter table public.expense_new disable trigger handle_updated_at';
  end if;
end;
$$;

with ranked as (
  select
    id,
    paid_by_bank,
    case
      when coalesce(expense_type, '') <> 'Legacy Expense' and custom_fields ->> 'legacy_source' is null
      then row_number() over (
        partition by org_id, (coalesce(expense_type, '') <> 'Legacy Expense' and custom_fields ->> 'legacy_source' is null)
        -- Millisecond truncation and byte-order ids mirror the browser sort,
        -- which compares Date.getTime() (ms) and then the id string.
        order by date_trunc('milliseconds', paid_approval_time) asc nulls first,
                 date_trunc('milliseconds', created_at) asc,
                 id::text collate "C" asc
      )
    end as pd_n,
    case
      when coalesce(paid_by_bank, '') <> ''
      then row_number() over (
        partition by org_id, paid_by_bank
        order by date_trunc('milliseconds', paid_approval_time) asc nulls first,
                 date_trunc('milliseconds', created_at) asc,
                 id::text collate "C" asc
      )
    end as ref_n
  from public.expense_new
  where payment_status = 'paid'
)
update public.expense_new e
set pd_row_no     = r.pd_n,
    bank_ref_no   = r.ref_n,
    bank_ref_bank = case when r.ref_n is not null then r.paid_by_bank end
from ranked r
where e.id = r.id
  and (r.pd_n is not null or r.ref_n is not null);

-- Start every counter where the backfill left off.
insert into public.expense_sequences (org_id, kind, bank, last_value)
select org_id, 'pd_row', '', max(pd_row_no)
from public.expense_new
where pd_row_no is not null
group by org_id
union all
select org_id, 'bank_ref', bank_ref_bank, max(bank_ref_no)
from public.expense_new
where bank_ref_no is not null
group by org_id, bank_ref_bank
on conflict (org_id, kind, bank)
do update set last_value = greatest(public.expense_sequences.last_value, excluded.last_value);

-- "Mark as Advance" froze the S.No. it saw into custom_fields. Rows marked
-- after the import froze a shifted number; align them with pd_row_no so the
-- Advance Payment Records page and the Records tab agree.
update public.expense_new
set custom_fields = jsonb_set(custom_fields, '{original_serial_number}', to_jsonb(pd_row_no))
where payment_status = 'paid'
  and pd_row_no is not null
  and custom_fields ->> 'marked_as_advance' = 'true'
  and (custom_fields ->> 'original_serial_number') is distinct from pd_row_no::text;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'handle_updated_at' and tgrelid = 'public.expense_new'::regclass) then
    execute 'alter table public.expense_new enable trigger handle_updated_at';
  end if;
end;
$$;
