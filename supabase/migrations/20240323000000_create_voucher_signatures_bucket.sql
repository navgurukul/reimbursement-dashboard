-- Create storage bucket for voucher signatures
insert into storage.buckets (id, name, public)
values ('voucher-signatures', 'voucher-signatures', false);

-- Create storage policy to allow authenticated users to upload signatures
create policy "Users can upload own signatures"
  on storage.objects for insert
  with check (
    auth.role() = 'authenticated' and
    bucket_id = 'voucher-signatures' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create storage policy to allow users to read their own signatures
create policy "Users can read own signatures"
  on storage.objects for select
  using (
    auth.role() = 'authenticated' and
    bucket_id = 'voucher-signatures' and
    (
      -- User can access their own signatures
      (storage.foldername(name))[1] = auth.uid()::text
      or
      -- Admins can access all signatures in their org
      auth.uid() in (
        select user_id
        from public.organization_users
        where organization_users.role in ('owner', 'admin')
        and organization_users.org_id = (storage.foldername(name))[2]::uuid
      )
    )
  ); 