create table if not exists public.trader_binance_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.trader_accounts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'Binance' check (provider = 'Binance'),
  environment text not null default 'mainnet' check (environment in ('mainnet','testnet')),
  status text not null default 'disconnected' check (status in ('disconnected','pending','connected','error')),
  credential_secret_id uuid,
  api_key_fingerprint text,
  api_key_last4 text,
  permission_read boolean not null default false,
  permission_trade boolean not null default false,
  permission_withdraw boolean not null default false,
  permission_internal_transfer boolean not null default false,
  ip_restricted boolean,
  binance_uid_last4 text,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_execution_controls (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  global_live_enabled boolean not null default false,
  kill_switch boolean not null default true,
  max_live_capital numeric not null default 0 check (max_live_capital >= 0),
  max_single_order numeric not null default 0 check (max_single_order >= 0),
  max_concurrent_live_trades integer not null default 1 check (max_concurrent_live_trades >= 1),
  daily_loss_limit numeric not null default 0 check (daily_loss_limit >= 0),
  live_confirmed_at timestamptz,
  live_generation bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_gateway_config (
  name text primary key,
  base_url text,
  shared_secret_id uuid,
  status text not null default 'pending' check (status in ('disabled','pending','ready','error')),
  egress_ip text,
  last_health_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_broker_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  bot_id uuid references public.trader_bots(id) on delete set null,
  trade_id uuid references public.trader_trades(id) on delete set null,
  order_id uuid references public.trader_orders(id) on delete set null,
  mode text not null check (mode in ('shadow','live')),
  event_type text not null,
  pair text,
  client_order_id text,
  exchange_order_id text,
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.trader_bots add column if not exists execution_mode text not null default 'paper';
do $$ begin
  alter table public.trader_bots add constraint trader_bots_execution_mode_check check (execution_mode in ('paper','shadow','live'));
exception when duplicate_object then null; end $$;

alter table public.trader_trades add column if not exists execution_mode text not null default 'paper';
do $$ begin
  alter table public.trader_trades add constraint trader_trades_execution_mode_check check (execution_mode in ('paper','shadow','live'));
exception when duplicate_object then null; end $$;

insert into public.trader_execution_controls(account_id)
select id from public.trader_accounts
on conflict (account_id) do nothing;

insert into public.trader_gateway_config(name,status)
values ('binance','pending')
on conflict (name) do nothing;

create or replace function public.trader_binance_store_secret(p_account_id uuid, p_owner_user_id uuid, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_owner uuid;
begin
  select owner_user_id into v_owner from public.trader_accounts where id = p_account_id;
  if not found then raise exception 'trader_account_not_found'; end if;
  if v_owner is null or v_owner <> p_owner_user_id then raise exception 'trader_account_owner_mismatch'; end if;
  select credential_secret_id into v_secret_id from public.trader_binance_connections where account_id = p_account_id;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, 'trader_binance_' || p_account_id::text, 'Encrypted Binance trading credentials for LabNarrative Trading', null);
    update public.trader_binance_connections set credential_secret_id=v_secret_id, updated_at=now() where account_id=p_account_id;
  else
    perform vault.update_secret(v_secret_id, p_secret, 'trader_binance_' || p_account_id::text, 'Encrypted Binance trading credentials for LabNarrative Trading', null);
  end if;
  return v_secret_id;
end;
$$;

create or replace function public.trader_binance_read_secret(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select credential_secret_id into v_secret_id from public.trader_binance_connections where account_id=p_account_id;
  if v_secret_id is null then raise exception 'credential_not_found'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_secret_id;
  if v_secret is null then raise exception 'credential_not_found'; end if;
  return v_secret;
end;
$$;

create or replace function public.trader_gateway_read_secret()
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select shared_secret_id into v_secret_id from public.trader_gateway_config where name='binance';
  if v_secret_id is null then raise exception 'gateway_secret_not_configured'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_secret_id;
  if v_secret is null then raise exception 'gateway_secret_not_configured'; end if;
  return v_secret;
end;
$$;

create or replace function public.trader_gateway_rotate_secret()
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  v_secret := encode(gen_random_bytes(32),'hex');
  select shared_secret_id into v_secret_id from public.trader_gateway_config where name='binance';
  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_secret, 'trader_binance_gateway', 'Shared HMAC secret for the LabNarrative Binance static-IP relay', null);
    update public.trader_gateway_config set shared_secret_id=v_secret_id,status='pending',updated_at=now() where name='binance';
  else
    perform vault.update_secret(v_secret_id,v_secret,'trader_binance_gateway','Shared HMAC secret for the LabNarrative Binance static-IP relay',null);
    update public.trader_gateway_config set status='pending',updated_at=now() where name='binance';
  end if;
  return v_secret;
end;
$$;

revoke all on table public.trader_binance_connections from anon, authenticated;
revoke all on table public.trader_execution_controls from anon, authenticated;
revoke all on table public.trader_gateway_config from anon, authenticated;
revoke all on table public.trader_broker_events from anon, authenticated;
revoke all on function public.trader_binance_store_secret(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.trader_binance_read_secret(uuid) from public, anon, authenticated;
revoke all on function public.trader_gateway_read_secret() from public, anon, authenticated;
revoke all on function public.trader_gateway_rotate_secret() from public, anon, authenticated;
grant execute on function public.trader_binance_store_secret(uuid,uuid,text) to service_role;
grant execute on function public.trader_binance_read_secret(uuid) to service_role;
grant execute on function public.trader_gateway_read_secret() to service_role;
grant execute on function public.trader_gateway_rotate_secret() to service_role;

create index if not exists trader_broker_events_account_created_idx on public.trader_broker_events(account_id,created_at desc);
create index if not exists trader_broker_events_trade_created_idx on public.trader_broker_events(trade_id,created_at desc) where trade_id is not null;
