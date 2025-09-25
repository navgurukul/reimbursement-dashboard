-- Create storage bucket for receipts
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false);

-- Create storage policy to allow authenticated users to upload receipts
create policy "Users can upload own receipts"
  on storage.objects for insert
  with check (
    auth.role() = 'authenticated' and
    bucket_id = 'expense-receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create storage policy to allow users to read their own receipts
create policy "Users can read own receipts"
  on storage.objects for select
  using (
    auth.role() = 'authenticated' and
    bucket_id = 'expense-receipts' and
    (
      -- User can access their own receipts
      (storage.foldername(name))[1] = auth.uid()::text
      or
      -- Admins can access all receipts in their org
      auth.uid() in (
        select user_id
        from public.organization_users
        where organization_users.role in ('owner', 'admin')
        and organization_users.org_id = (storage.foldername(name))[2]::uuid
      )
    )
  );

-- Create expense status enum
create type public.expense_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed'
);

-- Create expense validation status enum
create type public.validation_status as enum (
  'valid',
  'warning',
  'violation'
);

-- Create receipt info type
create type public.receipt_info as (
  filename text,
  path text,
  size bigint,
  mime_type text
);

-- Create expenses table
create table public.expense_new (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_type text not null,
  amount numeric(10,2) not null,
  date date not null,
  status expense_status not null default 'draft',
  receipt receipt_info,
  custom_fields jsonb not null default '{}'::jsonb,
  policy_validations jsonb[] not null default array[]::jsonb[],
  approver_id uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add RLS policies
alter table public.expense_new enable row level security;

-- Allow users to read their own expenses and org admins to read all expenses
create policy "Users can read own expenses and admins can read all"
  on public.expense_new for select
  using (
    auth.uid() = user_id or
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = expense_new.org_id
      and organization_users.role in ('owner', 'admin')
    )
  );

-- Allow users to create their own expenses
create policy "Users can create own expenses"
  on public.expense_new for insert
  with check (
    auth.uid() = user_id and
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = expense_new.org_id
    )
  );

-- Allow users to update their own draft expenses
create policy "Users can update own draft expenses"
  on public.expense_new for update
  using (
    auth.uid() = user_id and
    status = 'draft'
  )
  with check (
    auth.uid() = user_id and
    status = 'draft'
  );

-- Allow admins to update any expense status
create policy "Admins can update any expense"
  on public.expense_new for update
  using (
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = expense_new.org_id
      and organization_users.role in ('owner', 'admin')
    )
  )
  with check (
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = expense_new.org_id
      and organization_users.role in ('owner', 'admin')
    )
  );

-- Create function to validate expense against policies
create or replace function public.validate_expense_against_policies(
  expense_row public.expense_new
) returns jsonb[]
language plpgsql
security definer
as $$
declare
  org_policies jsonb;
  policy_validation jsonb;
  validations jsonb[] := array[]::jsonb[];
  policy jsonb;
begin
  -- Get organization policies
  select expense_columns
  from public.org_settings
  where org_id = expense_row.org_id
  into org_policies;

  -- If no policies found, return empty array
  if org_policies is null then
    return validations;
  end if;

  -- Loop through each policy
  for policy in select * from jsonb_array_elements(org_policies)
  loop
    -- Initialize validation object
    policy_validation := jsonb_build_object(
      'policy_type', policy->>'expense_type',
      'status', 'valid'::public.validation_status,
      'message', null
    );

    -- Check if expense type matches policy
    if expense_row.expense_type = (policy->>'expense_type') then
      -- Validate amount against upper limit
      if (policy->>'upper_limit') is not null and
         expense_row.amount > (policy->>'upper_limit')::numeric then
        policy_validation := policy_validation || 
          jsonb_build_object(
            'status', 'violation',
            'message', format('Amount exceeds upper limit of %s', policy->>'upper_limit')
          );
      end if;

      -- Validate per unit cost if applicable
      if (policy->>'per_unit_cost') is not null and
         (expense_row.custom_fields->>'units') is not null then
        declare
          per_unit_cost numeric;
          units numeric;
          expected_amount numeric;
        begin
          -- Extract numeric value from per_unit_cost (e.g., "3/km" -> 3)
          per_unit_cost := regexp_replace(policy->>'per_unit_cost', '[^0-9.]', '', 'g')::numeric;
          units := (expense_row.custom_fields->>'units')::numeric;
          expected_amount := per_unit_cost * units;

          if expense_row.amount > expected_amount then
            policy_validation := policy_validation || 
              jsonb_build_object(
                'status', 'violation',
                'message', format('Amount exceeds calculated cost of %s * %s units = %s', 
                  policy->>'per_unit_cost', units, expected_amount)
              );
          end if;
        exception when others then
          -- Handle any conversion errors
          policy_validation := policy_validation || 
            jsonb_build_object(
              'status', 'warning',
              'message', 'Could not validate per-unit cost'
            );
        end;
      end if;

      -- Add validation result to array
      validations := array_append(validations, policy_validation);
    end if;
  end loop;

  return validations;
end;
$$;

-- Create trigger to automatically validate expenses
create or replace function public.handle_expense_validation()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only validate if status is being changed to 'submitted'
  if (TG_OP = 'UPDATE' and new.status = 'submitted') or
     (TG_OP = 'INSERT' and new.status = 'submitted') then
    new.policy_validations := public.validate_expense_against_policies(new);
  end if;
  return new;
end;
$$;

-- Add trigger for expense validation
create trigger validate_expense
  before insert or update on public.expense_new
  for each row
  execute function public.handle_expense_validation();

-- Add trigger for updated_at
create trigger handle_updated_at
  before update on public.expense_new
  for each row
  execute function public.handle_updated_at(); 