alter table public.expense_new
  add column if not exists actual_amount numeric(10,2);

-- Create a function to automatically calculate actual_amount from approved_amount and tds_deduction_amount
create or replace function public.calculate_actual_amount()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Calculate actual_amount as approved_amount - tds_deduction_amount
  if new.approved_amount is not null then
    new.actual_amount := new.approved_amount - coalesce(new.tds_deduction_amount, 0);
  end if;
  return new;
end;
$$;

-- Create trigger to automatically calculate actual_amount
create trigger calculate_actual_amount_trigger
  before insert or update on public.expense_new
  for each row
  execute function public.calculate_actual_amount();
