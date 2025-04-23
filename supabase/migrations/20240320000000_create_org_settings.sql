-- Create a custom type for column configuration
create type public.column_type as enum (
  'text',
  'number',
  'date',
  'dropdown',
  'radio',
  'checkbox',
  'textarea'
);

-- Create the org_settings table
create table public.org_settings (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_columns jsonb not null default '[]'::jsonb,
  branding jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (org_id)
);

-- Add RLS policies
alter table public.org_settings enable row level security;

-- Allow organization members to read settings
create policy "Organization members can read settings"
  on public.org_settings for select
  using (
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = org_settings.org_id
    )
  );

-- Allow only organization owners and admins to update settings
create policy "Only owners and admins can update settings"
  on public.org_settings for update
  using (
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = org_settings.org_id
      and organization_users.role in ('owner', 'admin')
    )
  )
  with check (
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = org_settings.org_id
      and organization_users.role in ('owner', 'admin')
    )
  );

-- Allow only organization owners and admins to insert settings
create policy "Only owners and admins can insert settings"
  on public.org_settings for insert
  with check (
    auth.uid() in (
      select user_id 
      from public.organization_users 
      where organization_users.org_id = org_settings.org_id
      and organization_users.role in ('owner', 'admin')
    )
  );

-- Add function to automatically update updated_at
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Add trigger to automatically update updated_at
create trigger handle_updated_at
  before update on public.org_settings
  for each row
  execute function public.handle_updated_at(); 