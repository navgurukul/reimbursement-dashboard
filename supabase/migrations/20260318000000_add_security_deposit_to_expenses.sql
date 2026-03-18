alter table public.expense_new
  add column if not exists security_deposit_amount numeric(10,2);

alter table public.expense_new
  add constraint expense_new_security_deposit_amount_check
  check (
    security_deposit_amount is null
    or security_deposit_amount >= 0
  );

create or replace function public.calculate_actual_amount()
returns trigger
language plpgsql
security definer
as $$
declare
  base_amount numeric(10,2);
begin
  base_amount := coalesce(new.approved_amount, new.amount);

  if base_amount is not null then
    new.actual_amount :=
      base_amount
      - coalesce(new.tds_deduction_amount, 0)
      - coalesce(new.security_deposit_amount, 0);
  else
    new.actual_amount := null;
  end if;

  return new;
end;
$$;