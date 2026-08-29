-- Additive multi-exchange credential/status store for Trader.
-- Existing Binance tables and live execution remain unchanged.

create table public.trader_exchange_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  environment text not null default 'mainnet',
  status text not null default 'disconnected',
  credential_secret_id uuid,
  api_key_fingerprint text,
  api_key_last4 text,
  permission_read boolean not null default false,
  permission_trade boolean not null default false,
  permission_withdraw boolean not null default false,
  ip_restricted boolean,
  external_uid_last4 text,
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trader_exchange_connections_provider_check
    check (provider in ('bybit','okx','coinbase','kraken','kucoin')),
  constraint trader_exchange_connections_environment_check
    check (environment in ('mainnet','testnet')),
  constraint trader_exchange_connections_status_check
    check (status in ('disconnected','pending','connected','error')),
  constraint trader_exchange_connections_account_provider_key
    unique (account_id, provider)
);

create index trader_exchange_connections_owner_provider_idx
  on public.trader_exchange_connections(owner_user_id, provider);

alter table public.trader_exchange_connections enable row level security;

-- Connection metadata and encrypted-secret references are never directly exposed
-- to browser roles. Authenticated users access sanitized values through Edge Functions.
revoke all on table public.trader_exchange_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.trader_exchange_connections to service_role;

create or replace function public.trader_exchange_store_secret(
  p_account_id uuid,
  p_owner_user_id uuid,
  p_provider text,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_provider text := lower(trim(p_provider));
  v_secret_id uuid;
  v_owner uuid;
  v_kind text;
  v_status text;
begin
  if v_provider not in ('bybit','okx','coinbase','kraken','kucoin') then
    raise exception 'unsupported_exchange_provider';
  end if;

  select owner_user_id, account_kind, status
    into v_owner, v_kind, v_status
  from public.trader_accounts
  where id = p_account_id;

  if not found then raise exception 'trader_account_not_found'; end if;
  if v_owner is null or v_owner <> p_owner_user_id then raise exception 'trader_account_owner_mismatch'; end if;
  if v_kind <> 'real' or v_status <> 'active' then raise exception 'real_account_required'; end if;

  select credential_secret_id into v_secret_id
  from public.trader_exchange_connections
  where account_id = p_account_id and provider = v_provider;

  if not found then raise exception 'exchange_connection_not_found'; end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret,
      'trader_exchange_' || v_provider || '_' || p_account_id::text,
      'Encrypted ' || initcap(v_provider) || ' credentials for LabNarrative Trading',
      null
    );
    update public.trader_exchange_connections
      set credential_secret_id = v_secret_id, updated_at = now()
      where account_id = p_account_id and provider = v_provider;
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      'trader_exchange_' || v_provider || '_' || p_account_id::text,
      'Encrypted ' || initcap(v_provider) || ' credentials for LabNarrative Trading',
      null
    );
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.trader_exchange_read_secret(
  p_account_id uuid,
  p_provider text
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_provider text := lower(trim(p_provider));
  v_secret_id uuid;
  v_secret text;
begin
  if v_provider not in ('bybit','okx','coinbase','kraken','kucoin') then
    raise exception 'unsupported_exchange_provider';
  end if;

  select credential_secret_id into v_secret_id
  from public.trader_exchange_connections
  where account_id = p_account_id and provider = v_provider;

  if v_secret_id is null then raise exception 'credential_not_found'; end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id = v_secret_id;

  if v_secret is null then raise exception 'credential_not_found'; end if;
  return v_secret;
end;
$$;

revoke all on function public.trader_exchange_store_secret(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.trader_exchange_read_secret(uuid,text) from public, anon, authenticated;
grant execute on function public.trader_exchange_store_secret(uuid,uuid,text,text) to service_role;
grant execute on function public.trader_exchange_read_secret(uuid,text) to service_role;
