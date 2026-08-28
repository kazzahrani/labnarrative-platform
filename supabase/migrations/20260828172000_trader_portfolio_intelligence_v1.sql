create table if not exists public.trader_portfolio_preferences (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  scope_mode text not null default 'all' check (scope_mode in ('core','all','custom')),
  excluded_bot_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now()
);

alter table public.trader_portfolio_preferences enable row level security;
revoke all on public.trader_portfolio_preferences from anon, authenticated;
grant select, insert, update, delete on public.trader_portfolio_preferences to authenticated;

drop policy if exists trader_portfolio_preferences_owner_select on public.trader_portfolio_preferences;
create policy trader_portfolio_preferences_owner_select on public.trader_portfolio_preferences
for select to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
);
drop policy if exists trader_portfolio_preferences_owner_insert on public.trader_portfolio_preferences;
create policy trader_portfolio_preferences_owner_insert on public.trader_portfolio_preferences
for insert to authenticated with check (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
);
drop policy if exists trader_portfolio_preferences_owner_update on public.trader_portfolio_preferences;
create policy trader_portfolio_preferences_owner_update on public.trader_portfolio_preferences
for update to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
);
drop policy if exists trader_portfolio_preferences_owner_delete on public.trader_portfolio_preferences;
create policy trader_portfolio_preferences_owner_delete on public.trader_portfolio_preferences
for delete to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
);

create table if not exists public.trader_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  captured_at timestamptz not null,
  total_value numeric not null default 0,
  cash_value numeric not null default 0,
  core_value numeric not null default 0,
  bot_value numeric not null default 0,
  holdings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(account_id, captured_at)
);
create index if not exists trader_portfolio_snapshots_account_time_idx on public.trader_portfolio_snapshots(account_id, captured_at desc);
alter table public.trader_portfolio_snapshots enable row level security;
revoke all on public.trader_portfolio_snapshots from anon, authenticated;
grant select on public.trader_portfolio_snapshots to authenticated;

drop policy if exists trader_portfolio_snapshots_owner_select on public.trader_portfolio_snapshots;
create policy trader_portfolio_snapshots_owner_select on public.trader_portfolio_snapshots
for select to authenticated using (
  exists (select 1 from public.trader_accounts a where a.id = account_id and a.owner_user_id = auth.uid())
);

create or replace function public.trader_record_portfolio_snapshot(
  p_account_id uuid,
  p_total_value numeric,
  p_cash_value numeric,
  p_core_value numeric,
  p_bot_value numeric,
  p_holdings jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now());
begin
  if auth.uid() is null or not exists (
    select 1 from public.trader_accounts a where a.id = p_account_id and a.owner_user_id = auth.uid()
  ) then
    raise exception 'portfolio_account_not_owned';
  end if;

  insert into public.trader_portfolio_snapshots(account_id,captured_at,total_value,cash_value,core_value,bot_value,holdings,metadata)
  values (
    p_account_id,
    v_bucket,
    greatest(coalesce(p_total_value,0),0),
    greatest(coalesce(p_cash_value,0),0),
    greatest(coalesce(p_core_value,0),0),
    greatest(coalesce(p_bot_value,0),0),
    coalesce(p_holdings,'[]'::jsonb),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(account_id,captured_at) do update set
    total_value=excluded.total_value,
    cash_value=excluded.cash_value,
    core_value=excluded.core_value,
    bot_value=excluded.bot_value,
    holdings=excluded.holdings,
    metadata=excluded.metadata;

  return v_bucket;
end;
$$;
revoke all on function public.trader_record_portfolio_snapshot(uuid,numeric,numeric,numeric,numeric,jsonb,jsonb) from public, anon;
grant execute on function public.trader_record_portfolio_snapshot(uuid,numeric,numeric,numeric,numeric,jsonb,jsonb) to authenticated;
