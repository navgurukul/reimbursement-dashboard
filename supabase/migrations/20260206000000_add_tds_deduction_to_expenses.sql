alter table public.expense_new
  add column if not exists tds_deduction_percentage integer,
  add column if not exists tds_deduction_amount numeric(10,2);

alter table public.expense_new
  add constraint expense_new_tds_deduction_percentage_check
  check (
    tds_deduction_percentage is null
    or (tds_deduction_percentage between 1 and 50)
  );
