-- Serialize TradingView strategy order-stream signals per account without dropping
-- simultaneous alerts. This migration is intentionally backend-only and does not
-- replay historical failed events.

create table if not exists public.trader_strategy_signal_queue (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  bot_id uuid not null references public.trader_bots(id) on delete cascade,
  action text not null check (action in ('buy','sell')),
  pair text not null,
  signal_id text,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','dispatching','completed','failed','stalled')),
  attempts integer not null default 0 check (attempts >= 0),
  worker_id uuid,
  core_event_id uuid references public.trader_tradingview_events(id) on delete set null,
  error text,
  received_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists trader_strategy_signal_queue_account_pending_idx
  on public.trader_strategy_signal_queue(account_id, received_at, id)
  where status = 'pending';

create index if not exists trader_strategy_signal_queue_bot_pair_idx
  on public.trader_strategy_signal_queue(bot_id, pair, received_at desc);

create unique index if not exists trader_strategy_signal_queue_dedupe_idx
  on public.trader_strategy_signal_queue(bot_id, dedupe_key)
  where dedupe_key is not null;

alter table public.trader_strategy_signal_queue enable row level security;
revoke all on public.trader_strategy_signal_queue from public, anon, authenticated;
grant select, insert, update, delete on public.trader_strategy_signal_queue to service_role;

create table if not exists public.trader_strategy_signal_queue_locks (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  worker_id uuid not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.trader_strategy_signal_queue_locks enable row level security;
revoke all on public.trader_strategy_signal_queue_locks from public, anon, authenticated;
grant select, insert, update, delete on public.trader_strategy_signal_queue_locks to service_role;

create or replace function public.trader_claim_strategy_signal_queue(
  p_account_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
  v_seconds integer := greatest(30, least(coalesce(p_lease_seconds,120), 300));
begin
  if p_account_id is null or p_worker_id is null then
    return false;
  end if;

  insert into public.trader_strategy_signal_queue_locks(account_id, worker_id, locked_until, updated_at)
  values (p_account_id, p_worker_id, now() + make_interval(secs => v_seconds), now())
  on conflict (account_id) do update
    set worker_id = excluded.worker_id,
        locked_until = excluded.locked_until,
        updated_at = now()
    where public.trader_strategy_signal_queue_locks.locked_until < now()
       or public.trader_strategy_signal_queue_locks.worker_id = p_worker_id
  returning true into v_ok;

  return coalesce(v_ok,false);
end;
$$;

create or replace function public.trader_release_strategy_signal_queue(
  p_account_id uuid,
  p_worker_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trader_strategy_signal_queue_locks
  where account_id = p_account_id and worker_id = p_worker_id;
$$;

revoke all on function public.trader_claim_strategy_signal_queue(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.trader_release_strategy_signal_queue(uuid,uuid) from public, anon, authenticated;
grant execute on function public.trader_claim_strategy_signal_queue(uuid,uuid,integer) to service_role;
grant execute on function public.trader_release_strategy_signal_queue(uuid,uuid) to service_role;

-- TradingView Strategy currently calls trader_begin_command with a 30 second lease.
-- For that signature only, acquire the normal command lock and the exit lock
-- atomically. Waiting happens inside the RPC, so a background worker cannot turn a
-- valid TradingView signal into account_busy merely because it was already active.
create or replace function public.trader_begin_command(
  p_account_id uuid,
  p_lock_id uuid,
  p_lease_seconds integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
  v_seconds integer;
  v_attempt integer;
begin
  if coalesce(p_lease_seconds,15) = 30 then
    v_seconds := 60;
    for v_attempt in 1..50 loop
      update public.trader_accounts
      set worker_lock_id = p_lock_id,
          worker_locked_until = now() + make_interval(secs => v_seconds),
          exit_worker_lock_id = p_lock_id,
          exit_worker_locked_until = now() + make_interval(secs => v_seconds)
      where id = p_account_id
        and (worker_locked_until is null or worker_locked_until < now())
        and (exit_worker_locked_until is null or exit_worker_locked_until < now())
      returning true into v_ok;

      if coalesce(v_ok,false) then
        return true;
      end if;
      perform pg_sleep(0.10);
    end loop;
    return false;
  end if;

  v_seconds := case
    when coalesce(p_lease_seconds,15) <= 20 then 55
    else greatest(5, least(60, p_lease_seconds))
  end;

  update public.trader_accounts
  set worker_lock_id = p_lock_id,
      worker_locked_until = now() + make_interval(secs => v_seconds)
  where id = p_account_id
    and (worker_locked_until is null or worker_locked_until < now())
    and (exit_worker_locked_until is null or exit_worker_locked_until < now())
  returning true into v_ok;

  return coalesce(v_ok,false);
end;
$$;

-- The current TradingView executor follows trader_begin_command(lease=30) with
-- trader_begin_exit_command(lease=30). When the combined strategy lock is already
-- held, acknowledge that second step without replacing the combined lock owner.
create or replace function public.trader_begin_exit_command(
  p_account_id uuid,
  p_lock_id uuid,
  p_lease_seconds integer default 20
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if coalesce(p_lease_seconds,20) = 30 and exists (
    select 1
    from public.trader_accounts
    where id = p_account_id
      and worker_lock_id is not null
      and worker_lock_id = exit_worker_lock_id
      and worker_locked_until > now()
      and exit_worker_locked_until > now()
  ) then
    return true;
  end if;

  update public.trader_accounts
  set exit_worker_lock_id = p_lock_id,
      exit_worker_locked_until = now() + make_interval(secs => greatest(5, least(60, p_lease_seconds)))
  where id = p_account_id
    and (exit_worker_locked_until is null or exit_worker_locked_until < now())
  returning true into v_ok;

  return coalesce(v_ok,false);
end;
$$;

-- Releasing the command side of a combined TradingView lock also releases its
-- matching exit side. Unrelated exit-worker locks are never cleared.
create or replace function public.trader_release_account(
  p_account_id uuid,
  p_worker_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.trader_accounts
  set worker_locked_until = null,
      worker_lock_id = null,
      exit_worker_locked_until = case when exit_worker_lock_id = p_worker_id then null else exit_worker_locked_until end,
      exit_worker_lock_id = case when exit_worker_lock_id = p_worker_id then null else exit_worker_lock_id end,
      last_worker_at = now()
  where id = p_account_id and worker_lock_id = p_worker_id;
$$;

revoke all on function public.trader_begin_command(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.trader_begin_exit_command(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.trader_release_account(uuid,uuid) from public, anon, authenticated;
grant execute on function public.trader_begin_command(uuid,uuid,integer) to service_role;
grant execute on function public.trader_begin_exit_command(uuid,uuid,integer) to service_role;
grant execute on function public.trader_release_account(uuid,uuid) to service_role;
