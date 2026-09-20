-- Persist "PD Row No." and bank "REF No." on paid expenses.
--
-- Until now both numbers were derived on the client from a record's position
-- in the Records tab (index + 1): PD Row No. from the All Records list, REF No.
-- from the per-bank list. Any insert before a row, un-pay, bank re-tag or bulk
-- import renumbered every later record. The 2026-09-02 legacy import added
-- ~13.7k older rows and shifted every number finance had already written into
-- bank narrations since April 2026. These columns make the numbers stable:
-- assigned once by the database when a row is first marked paid, never
-- recomputed.

alter table public.expense_new
  add column if not exists pd_row_no integer,
  add column if not exists bank_ref_no integer,
  add column if not exists bank_ref_bank text;

comment on column public.expense_new.pd_row_no is
  'Stable "PD Row No.", shown as S.No. in Finance > Records > All Records. Issued once, when the expense is first marked paid. Null for legacy-import rows.';
comment on column public.expense_new.bank_ref_no is
  'Stable "REF No.", shown as S.No. in the NG/FC/Kotak Records tabs and written into bank narrations. One sequence per org and bank (bank_ref_bank).';
comment on column public.expense_new.bank_ref_bank is
  'The paid_by_bank value bank_ref_no was issued for. Changing the bank issues a new number in the new bank''s sequence.';

create unique index if not exists expense_new_org_pd_row_no_idx
  on public.expense_new (org_id, pd_row_no)
  where pd_row_no is not null;

create unique index if not exists expense_new_org_bank_ref_no_idx
  on public.expense_new (org_id, bank_ref_bank, bank_ref_no)
  where bank_ref_no is not null;

-- One counter row per (org, kind, bank). Updated under a row lock so two
-- finance users marking payments at the same moment cannot draw the same number.
create table if not exists public.expense_sequences (
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('pd_row', 'bank_ref')),
  bank text not null default '',
  last_value integer not null default 0,
  primary key (org_id, kind, bank)
);

-- No policies on purpose: nothing reads or writes this table except the
-- security-definer function below.
alter table public.expense_sequences enable row level security;

create or replace function public.next_expense_sequence_number(
  p_org_id uuid,
  p_kind text,
  p_bank text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  insert into public.expense_sequences as s (org_id, kind, bank, last_value)
  values (p_org_id, p_kind, coalesce(p_bank, ''), 1)
  on conflict (org_id, kind, bank)
  do update set last_value = s.last_value + 1
  returning s.last_value into v;
  return v;
end;
$$;

-- Only the trigger below may draw numbers; keep the counter out of reach of
-- PostgREST RPC callers, who could otherwise burn or skip numbers.
revoke execute on function public.next_expense_sequence_number(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.assign_expense_sequence_numbers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status is distinct from 'paid' then
    return new;
  end if;

  -- PD Row No.: once, on first payment. Legacy-import rows never get one; the
  -- numbers finance has used since April 2026 count app payments only.
  if new.pd_row_no is null
     and coalesce(new.expense_type, '') <> 'Legacy Expense'
     and new.custom_fields ->> 'legacy_source' is null then
    new.pd_row_no := public.next_expense_sequence_number(new.org_id, 'pd_row', '');
  end if;

  -- REF No.: per bank. Issued when a paid row first carries a bank, re-issued
  -- only when the bank actually changes. Clearing the bank keeps the old
  -- number, so re-selecting the same bank restores it instead of burning one.
  if coalesce(new.paid_by_bank, '') <> ''
     and (new.bank_ref_no is null or new.bank_ref_bank is distinct from new.paid_by_bank) then
    new.bank_ref_no := public.next_expense_sequence_number(new.org_id, 'bank_ref', new.paid_by_bank);
    new.bank_ref_bank := new.paid_by_bank;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_expense_sequence_numbers on public.expense_new;
create trigger assign_expense_sequence_numbers
  before insert or update on public.expense_new
  for each row
  execute function public.assign_expense_sequence_numbers();
