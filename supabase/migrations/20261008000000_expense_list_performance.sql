-- Expense list performance: indexes + filter-options function.
--
-- SAFE TO RUN ON PRODUCTION:
--   * Nothing here inserts, updates or deletes rows.
--   * Indexes only add lookup structures. At ~20k rows each one builds in well
--     under a second; writes to the table wait for that moment and then carry on.
--   * The function only reads.
--
-- HOW TO UNDO (if ever needed):
--   drop index if exists public.idx_expense_new_org_created;
--   drop index if exists public.idx_expense_new_org_user_created;
--   drop index if exists public.idx_expense_new_org_approver_status;
--   drop index if exists public.idx_expense_new_org_status_created;
--   drop index if exists public.idx_expense_new_org_payment_paid;
--   drop index if exists public.idx_vouchers_expense_id;
--   drop index if exists public.idx_organization_users_org_user;
--   drop function if exists public.get_expense_filter_options(uuid, text, uuid);

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------

-- "All Expenses" tab: newest first, paged.
create index if not exists idx_expense_new_org_created
  on public.expense_new (org_id, created_at desc, id desc);

-- "My Expenses" tab.
create index if not exists idx_expense_new_org_user_created
  on public.expense_new (org_id, user_id, created_at desc, id desc);

-- "Pending Approval" tab and the manager's "All Expenses" (approver = me).
create index if not exists idx_expense_new_org_approver_status
  on public.expense_new (org_id, approver_id, status, created_at desc);

-- Status stat cards, Finance Approvals queue, Payments queue.
create index if not exists idx_expense_new_org_status_created
  on public.expense_new (org_id, status, created_at desc);

-- Records / Advance Payment (paid expenses, ordered by paid time).
create index if not exists idx_expense_new_org_payment_paid
  on public.expense_new (org_id, payment_status, paid_approval_time, created_at, id);

-- Voucher lookup by expense.
create index if not exists idx_vouchers_expense_id
  on public.vouchers (expense_id);

-- Membership lookups (used by the RLS policies once RLS is switched on).
create index if not exists idx_organization_users_org_user
  on public.organization_users (org_id, user_id);

-- Refresh planner statistics so the new indexes are used straight away.
analyze public.expense_new;
analyze public.vouchers;
analyze public.organization_users;

-- ---------------------------------------------------------------------------
-- 2. Filter dropdown options for the Expenses page
-- ---------------------------------------------------------------------------
-- Returns the distinct values the filter dropdowns need, in one small
-- response, instead of the browser downloading every expense to work them out.
-- SECURITY INVOKER: it runs with the caller's permissions, so once RLS is
-- enabled on expense_new it only sees what the caller may see.

create or replace function public.get_expense_filter_options(
  p_org_id uuid,
  p_scope text default 'org',      -- 'org' | 'my' | 'approver' | 'pending'
  p_user_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select e.expense_type, e.location, e.status::text as status, e.user_id, e.approver_id
    from public.expense_new e
    where e.org_id = p_org_id
      and (
        p_scope = 'org'
        or (p_scope = 'my' and e.user_id = p_user_id)
        or (p_scope = 'approver' and e.approver_id = p_user_id)
        or (p_scope = 'pending' and e.approver_id = p_user_id and e.status = 'submitted')
      )
  )
  select jsonb_build_object(
    'expense_types', coalesce((
      select jsonb_agg(v order by v)
      from (select distinct expense_type as v from scoped where coalesce(expense_type, '') <> '') t
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(v order by v)
      from (select distinct location as v from scoped where coalesce(location, '') <> '') t
    ), '[]'::jsonb),
    'statuses', coalesce((
      select jsonb_agg(v order by v)
      from (select distinct status as v from scoped) t
    ), '[]'::jsonb),
    'creators', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.user_id, 'name', p.full_name) order by p.full_name)
      from public.profiles p
      where p.user_id in (select distinct user_id from scoped)
        and coalesce(p.full_name, '') <> ''
    ), '[]'::jsonb),
    'approvers', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.user_id, 'name', p.full_name) order by p.full_name)
      from public.profiles p
      where p.user_id in (select distinct approver_id from scoped where approver_id is not null)
        and coalesce(p.full_name, '') <> ''
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_expense_filter_options(uuid, text, uuid) from public, anon;
grant execute on function public.get_expense_filter_options(uuid, text, uuid) to authenticated;
