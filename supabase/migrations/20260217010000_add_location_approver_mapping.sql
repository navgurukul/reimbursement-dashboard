-- Add location of expense → approver mapping to org_settings
-- JSON array: { location, approver_name?, second_approver_name? }[]
alter table public.org_settings
  add column if not exists location_approver_mapping jsonb default '[]'::jsonb;

