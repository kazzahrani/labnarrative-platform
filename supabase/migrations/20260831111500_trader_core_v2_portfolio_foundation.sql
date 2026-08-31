-- Trader Core V2: additive shadow portfolio foundation.
-- No existing Trader tables are modified or replaced.

create table if not exists public.trader_v2_sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  provider text not null,
  sync_kind text not null default 'portfolio',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  asset_count integer not null default 0,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint trader_v2_sync_runs_status_check check (status in ('running','succeeded','partial','failed'))
);
create index if not exists trader_v2_sync_runs_account_provider_started_idx
  on public.trader_v2_sync_runs(account_id, provider, started_at desc);

create table if not exists public.trader_v2_balance_latest (
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  provider text not null,
  asset text not null,
  free numeric not null default 0,
  locked numeric not null default 0,
  total numeric not null default 0,
  source_at timestamptz not null,
  sync_run_id uuid references public.trader_v2_sync_runs(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (account_id, provider, asset)
);
create index if not exists trader_v2_balance_latest_account_updated_idx
  on public.trader_v2_balance_latest(account_id, updated_at desc);

create table if not exists public.trader_v2_asset_price_latest (
  asset text not null,
  quote_asset text not null default 'USDT',
  price_usd numeric not null,
  source_provider text not null,
  source_pair text not null,
  source_at timestamptz not null,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (asset, quote_asset)
);

create table if not exists public.trader_v2_portfolio_latest (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  captured_at timestamptz not null,
  total_usd numeric not null default 0,
  cash_usd numeric not null default 0,
  holdings_usd numeric not null default 0,
  connected_provider_count integer not null default 0,
  fresh_provider_count integer not null default 0,
  stale_provider_count integer not null default 0,
  unsupported_provider_count integer not null default 0,
  unpriced_asset_count integer not null default 0,
  provider_totals jsonb not null default '[]'::jsonb,
  asset_totals jsonb not null default '[]'::jsonb,
  sync_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_v2_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  bucket_at timestamptz not null,
  captured_at timestamptz not null,
  total_usd numeric not null default 0,
  cash_usd numeric not null default 0,
  holdings_usd numeric not null default 0,
  provider_totals jsonb not null default '[]'::jsonb,
  asset_totals jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, bucket_at)
);
create index if not exists trader_v2_portfolio_snapshots_account_time_idx
  on public.trader_v2_portfolio_snapshots(account_id, bucket_at desc);

-- Canonical financial event ledger. This starts empty and will be populated in a later
-- shadow-import phase after exchange-history reconciliation is implemented.
create table if not exists public.trader_v2_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  provider text,
  counterparty_provider text,
  asset text not null,
  quantity_delta numeric not null,
  fee_asset text,
  fee_quantity numeric not null default 0,
  usd_value numeric,
  occurred_at timestamptz not null,
  external_id text,
  transfer_group_id uuid,
  source text not null default 'exchange',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, event_key)
);
create index if not exists trader_v2_ledger_entries_account_time_idx
  on public.trader_v2_ledger_entries(account_id, occurred_at desc);
create index if not exists trader_v2_ledger_entries_transfer_idx
  on public.trader_v2_ledger_entries(account_id, transfer_group_id)
  where transfer_group_id is not null;

create table if not exists public.trader_v2_internal_transfers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  source_provider text not null,
  destination_provider text not null,
  asset text not null,
  gross_quantity numeric not null,
  fee_quantity numeric not null default 0,
  net_quantity numeric not null,
  withdrawal_external_id text,
  deposit_external_id text,
  initiated_at timestamptz,
  completed_at timestamptz,
  status text not null default 'matched',
  confidence numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trader_v2_internal_transfers_account_time_idx
  on public.trader_v2_internal_transfers(account_id, coalesce(completed_at, initiated_at, created_at) desc);

-- Replace one provider's balance image atomically. Missing assets are removed so a
-- fully sold/transferred asset cannot remain as a stale positive balance.
create or replace function public.trader_v2_replace_provider_balances(
  p_account_id uuid,
  p_provider text,
  p_sync_run_id uuid,
  p_source_at timestamptz,
  p_balances jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  delete from public.trader_v2_balance_latest
  where account_id = p_account_id and provider = lower(trim(p_provider));

  insert into public.trader_v2_balance_latest(
    account_id, provider, asset, free, locked, total, source_at, sync_run_id, updated_at
  )
  select
    p_account_id,
    lower(trim(p_provider)),
    upper(trim(x.asset)),
    greatest(coalesce(x.free,0),0),
    greatest(coalesce(x.locked,0),0),
    greatest(coalesce(x.total,coalesce(x.free,0)+coalesce(x.locked,0)),0),
    p_source_at,
    p_sync_run_id,
    now()
  from jsonb_to_recordset(coalesce(p_balances,'[]'::jsonb)) as x(asset text, free numeric, locked numeric, total numeric)
  where trim(coalesce(x.asset,'')) <> ''
    and greatest(coalesce(x.total,coalesce(x.free,0)+coalesce(x.locked,0)),0) > 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.trader_v2_replace_provider_balances(uuid,text,uuid,timestamptz,jsonb) from public;
grant execute on function public.trader_v2_replace_provider_balances(uuid,text,uuid,timestamptz,jsonb) to service_role;

alter table public.trader_v2_sync_runs enable row level security;
alter table public.trader_v2_balance_latest enable row level security;
alter table public.trader_v2_asset_price_latest enable row level security;
alter table public.trader_v2_portfolio_latest enable row level security;
alter table public.trader_v2_portfolio_snapshots enable row level security;
alter table public.trader_v2_ledger_entries enable row level security;
alter table public.trader_v2_internal_transfers enable row level security;
