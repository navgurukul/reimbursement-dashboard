-- Drop existing table if it exists
drop table if exists public.vouchers;

-- Create vouchers table
create table public.vouchers (
    id uuid default gen_random_uuid() primary key,
    expense_id uuid references public.expense_new(id) on delete cascade,
    your_name text not null,
    voucher_date timestamp with time zone not null,
    amount numeric(10,2) not null,
    purpose text not null,
    credit_person text not null,
    signature_url text,
    manager_signature_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.vouchers enable row level security;

-- Allow users to read their own vouchers and admins to read all vouchers
create policy "Users can read own vouchers and admins can read all"
    on public.vouchers for select
    using (
        exists (
            select 1 from public.expense_new
            where expense_new.id = vouchers.expense_id
            and (
                expense_new.user_id = auth.uid()
                or auth.uid() in (
                    select user_id 
                    from public.organization_users 
                    where organization_users.org_id = expense_new.org_id
                    and organization_users.role in ('owner', 'admin')
                )
            )
        )
    );

-- Allow users to create vouchers for their own expenses
create policy "Users can create vouchers for own expenses"
    on public.vouchers for insert
    with check (
        exists (
            select 1 from public.expense_new
            where expense_new.id = expense_id
            and expense_new.user_id = auth.uid()
        )
    );

-- Allow users to update their own vouchers
create policy "Users can update own vouchers"
    on public.vouchers for update
    using (
        exists (
            select 1 from public.expense_new
            where expense_new.id = vouchers.expense_id
            and expense_new.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.expense_new
            where expense_new.id = vouchers.expense_id
            and expense_new.user_id = auth.uid()
        )
    );

-- Add trigger for updating updated_at timestamp
create trigger handle_updated_at
    before update on public.vouchers
    for each row
    execute function public.handle_updated_at();

-- Create index for faster lookups
create index idx_vouchers_expense_id on public.vouchers(expense_id); 