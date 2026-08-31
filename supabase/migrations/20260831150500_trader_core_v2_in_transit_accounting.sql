-- Trader Core V2: learned internal destinations and in-transit accounting.
-- A withdrawal is only treated as internal-in-transit when its destination address
-- was previously proven by an exact matched transfer to one of this account's exchanges.

create table if not exists public.trader_v2_internal_destinations (
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  provider text not null,
  asset text not null,
  address text not null,
  network text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_transfer_id uuid references public.trader_v2_internal_transfers(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (account_id, provider, asset, address)
);
create index if not exists trader_v2_internal_destinations_lookup_idx
  on public.trader_v2_internal_destinations(account_id, asset, address);
alter table public.trader_v2_internal_destinations enable row level security;

create or replace function public.trader_v2_learn_internal_destination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address text;
  v_network text;
begin
  select nullif(trim(coalesce(metadata->>'address','')), ''),
         nullif(trim(coalesce(metadata->>'network','')), '')
    into v_address, v_network
  from public.trader_v2_ledger_entries
  where account_id = new.account_id
    and provider = new.destination_provider
    and event_type = 'deposit'
    and external_id = new.deposit_external_id
  order by occurred_at desc
  limit 1;

  if v_address is null then
    return new;
  end if;

  insert into public.trader_v2_internal_destinations(
    account_id, provider, asset, address, network,
    first_seen_at, last_seen_at, source_transfer_id, metadata
  ) values (
    new.account_id, new.destination_provider, upper(new.asset), v_address, v_network,
    coalesce(new.completed_at, new.initiated_at, now()),
    coalesce(new.completed_at, new.initiated_at, now()),
    new.id,
    jsonb_build_object('confidence', new.confidence, 'learnedFrom', 'matched_transfer')
  )
  on conflict (account_id, provider, asset, address) do update
  set network = coalesce(excluded.network, public.trader_v2_internal_destinations.network),
      last_seen_at = greatest(public.trader_v2_internal_destinations.last_seen_at, excluded.last_seen_at),
      source_transfer_id = excluded.source_transfer_id,
      metadata = public.trader_v2_internal_destinations.metadata || excluded.metadata;

  return new;
end;
$$;

revoke all on function public.trader_v2_learn_internal_destination() from public;

drop trigger if exists trader_v2_internal_transfer_learn_destination on public.trader_v2_internal_transfers;
create trigger trader_v2_internal_transfer_learn_destination
after insert or update of destination_provider, deposit_external_id, asset, completed_at
on public.trader_v2_internal_transfers
for each row execute function public.trader_v2_learn_internal_destination();

-- Backfill destinations from already matched shadow transfers.
insert into public.trader_v2_internal_destinations(
  account_id, provider, asset, address, network,
  first_seen_at, last_seen_at, source_transfer_id, metadata
)
select
  t.account_id,
  t.destination_provider,
  upper(t.asset),
  trim(l.metadata->>'address'),
  nullif(trim(coalesce(l.metadata->>'network','')), ''),
  coalesce(t.completed_at, t.initiated_at, t.created_at),
  coalesce(t.completed_at, t.initiated_at, t.created_at),
  t.id,
  jsonb_build_object('confidence', t.confidence, 'learnedFrom', 'matched_transfer_backfill')
from public.trader_v2_internal_transfers t
join public.trader_v2_ledger_entries l
  on l.account_id = t.account_id
 and l.provider = t.destination_provider
 and l.event_type = 'deposit'
 and l.external_id = t.deposit_external_id
where trim(coalesce(l.metadata->>'address','')) <> ''
on conflict (account_id, provider, asset, address) do update
set network = coalesce(excluded.network, public.trader_v2_internal_destinations.network),
    last_seen_at = greatest(public.trader_v2_internal_destinations.last_seen_at, excluded.last_seen_at),
    source_transfer_id = excluded.source_transfer_id,
    metadata = public.trader_v2_internal_destinations.metadata || excluded.metadata;

create or replace view public.trader_v2_portfolio_accounting_latest
with (security_invoker = true)
as
with transit as (
  select
    l.account_id,
    coalesce(sum(
      greatest(abs(l.quantity_delta) - greatest(coalesce(l.fee_quantity,0),0), 0)
      * coalesce(
          case when upper(l.asset) in ('USDT','USDC','FDUSD','BUSD','TUSD','USDP','DAI') then 1::numeric end,
          p.price_usd,
          0::numeric
        )
    ),0::numeric) as in_transit_usd,
    jsonb_agg(
      jsonb_build_object(
        'provider', l.provider,
        'destinationProvider', d.provider,
        'asset', upper(l.asset),
        'sentQuantity', greatest(abs(l.quantity_delta) - greatest(coalesce(l.fee_quantity,0),0), 0),
        'feeQuantity', greatest(coalesce(l.fee_quantity,0),0),
        'occurredAt', l.occurred_at,
        'externalId', l.external_id
      ) order by l.occurred_at desc
    ) filter (where l.id is not null) as in_transit_items
  from public.trader_v2_ledger_entries l
  join public.trader_v2_internal_destinations d
    on d.account_id = l.account_id
   and upper(d.asset) = upper(l.asset)
   and d.address = nullif(trim(coalesce(l.metadata->>'address','')), '')
   and d.provider <> l.provider
  left join public.trader_v2_asset_price_latest p
    on p.asset = upper(l.asset) and p.quote_asset = 'USDT'
  where l.event_type = 'withdrawal'
    and l.transfer_group_id is null
    and l.occurred_at >= now() - interval '24 hours'
  group by l.account_id
)
select
  p.account_id,
  p.captured_at,
  p.total_usd as exchange_total_usd,
  coalesce(t.in_transit_usd,0::numeric) as in_transit_usd,
  p.total_usd + coalesce(t.in_transit_usd,0::numeric) as accounting_total_usd,
  p.cash_usd,
  p.holdings_usd,
  p.connected_provider_count,
  p.fresh_provider_count,
  p.stale_provider_count,
  p.unsupported_provider_count,
  p.unpriced_asset_count,
  p.provider_totals,
  p.asset_totals,
  coalesce(t.in_transit_items,'[]'::jsonb) as in_transit_items,
  p.sync_state,
  p.updated_at
from public.trader_v2_portfolio_latest p
left join transit t on t.account_id = p.account_id;
