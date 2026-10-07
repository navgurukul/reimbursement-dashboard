-- Add expense type → approver mapping to org_settings (JSON array: { expense_type, approver_id, second_approver_id? }[])
alter table public.org_settings
  add column if not exists expense_type_approver_mapping jsonb default '[]'::jsonb;
