-- Create profiles table
create table public.profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Create policy to allow users to read all profiles (needed for expense approvers)
create policy "Anyone can read profiles"
  on public.profiles for select
  using (true);

-- Create policy to allow users to update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create policy to allow authenticated users to create their profile
create policy "Users can create their profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- Add trigger for updated_at
create trigger handle_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at(); 