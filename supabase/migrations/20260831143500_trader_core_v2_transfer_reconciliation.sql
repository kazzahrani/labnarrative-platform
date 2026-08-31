-- Trader Core V2: additive transfer-aware ledger reconciliation.
-- Shadow-only. Existing V1 accounting, balances, orders and execution are untouched.

alter table public.trader_v2_internal_transfers
  add column if not exists match_key text;

create unique index if not exists trader_v2_internal_transfers_match_key_idx
  on public.trader_v2_internal_transfers(account_id, match_key)
  where match_key is not null;

create table if not exists public.trader_v2_transfer_sync_state (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  lock_id uuid,
  locked_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text,
  last_imported_count integer not null default 0,
  last_matched_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.trader_v2_transfer_sync_state enable row level security;

create or replace function public.trader_v2_claim_transfer_sync(
  p_account_id uuid,
  p_lock_id uuid,
  p_lease_seconds integer default 120
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  insert into public.trader_v2_transfer_sync_state(account_id)
  values (p_account_id)
  on conflict (account_id) do nothing;

  update public.trader_v2_transfer_sync_state
  set lock_id = p_lock_id,
      locked_until = now() + make_interval(secs => greatest(60, least(300, coalesce(p_lease_seconds, 120)))),
      last_started_at = now(),
      last_status = 'running',
      last_error = null,
      updated_at = now()
  where account_id = p_account_id
    and (locked_until is null or locked_until < now() or lock_id = p_lock_id)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

create or replace function public.trader_v2_release_transfer_sync(
  p_account_id uuid,
  p_lock_id uuid,
  p_status text default 'succeeded',
  p_imported_count integer default 0,
  p_matched_count integer default 0,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  update public.trader_v2_transfer_sync_state
  set lock_id = null,
      locked_until = null,
      last_completed_at = now(),
      last_status = left(coalesce(nullif(trim(p_status), ''), 'completed'), 40),
      last_imported_count = greatest(coalesce(p_imported_count, 0), 0),
      last_matched_count = greatest(coalesce(p_matched_count, 0), 0),
      last_error = case when p_error is null then null else left(p_error, 400) end,
      updated_at = now()
  where account_id = p_account_id
    and lock_id = p_lock_id
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.trader_v2_claim_transfer_sync(uuid,uuid,integer) from public;
revoke all on function public.trader_v2_release_transfer_sync(uuid,uuid,text,integer,integer,text) from public;
grant execute on function public.trader_v2_claim_transfer_sync(uuid,uuid,integer) to service_role;
grant execute on function public.trader_v2_release_transfer_sync(uuid,uuid,text,integer,integer,text) to service_role;
