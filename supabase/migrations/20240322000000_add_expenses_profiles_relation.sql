-- Add foreign key relationship between expenses and profiles
alter table public.expenses
  add constraint fk_expenses_profiles
  foreign key (user_id)
  references public.profiles(user_id)
  on delete cascade;

-- Add index for better join performance
create index idx_expenses_user_id on public.expenses(user_id); 