-- Trader Core V2: single-flight refresh lease.
-- Keeps scheduled/read-only portfolio refreshes from overlapping.

create table if not exists public.trader_v2_refresh_state (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  lock_id uuid,
  locked_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text,
  updated_at timestamptz not null default now()
);

alter table public.trader_v2_refresh_state enable row level security;

create or replace function public.trader_v2_claim_portfolio_refresh(
  p_account_id uuid,
  p_lock_id uuid,
  p_lease_seconds integer default 90
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  insert into public.trader_v2_refresh_state(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  update public.trader_v2_refresh_state
  set lock_id = p_lock_id,
      locked_until = now() + make_interval(secs => greatest(30, least(180, coalesce(p_lease_seconds, 90)))),
      last_started_at = now(),
      last_status = 'running',
      updated_at = now()
  where account_id = p_account_id
    and (locked_until is null or locked_until < now() or lock_id = p_lock_id)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

create or replace function public.trader_v2_release_portfolio_refresh(
  p_account_id uuid,
  p_lock_id uuid,
  p_status text default 'succeeded'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  update public.trader_v2_refresh_state
  set lock_id = null,
      locked_until = null,
      last_completed_at = now(),
      last_status = left(coalesce(nullif(trim(p_status), ''), 'completed'), 40),
      updated_at = now()
  where account_id = p_account_id
    and lock_id = p_lock_id
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.trader_v2_claim_portfolio_refresh(uuid,uuid,integer) from public;
revoke all on function public.trader_v2_release_portfolio_refresh(uuid,uuid,text) from public;
grant execute on function public.trader_v2_claim_portfolio_refresh(uuid,uuid,integer) to service_role;
grant execute on function public.trader_v2_release_portfolio_refresh(uuid,uuid,text) to service_role;
