-- First-class execution venue for trading automation.
-- Existing rows remain Binance; this is additive and preserves all history.

alter table public.trader_bots
  add column if not exists exchange_provider text not null default 'binance';

alter table public.trader_trades
  add column if not exists exchange_provider text not null default 'binance';

update public.trader_bots set exchange_provider = 'binance' where exchange_provider is null or exchange_provider = '';
update public.trader_trades set exchange_provider = 'binance' where exchange_provider is null or exchange_provider = '';

alter table public.trader_bots alter column exchange_provider set default 'binance';
alter table public.trader_bots alter column exchange_provider set not null;
alter table public.trader_trades alter column exchange_provider set default 'binance';
alter table public.trader_trades alter column exchange_provider set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trader_bots_exchange_provider_check') then
    alter table public.trader_bots add constraint trader_bots_exchange_provider_check
      check (exchange_provider in ('binance','bybit','okx','kraken','kucoin','coinbase'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trader_trades_exchange_provider_check') then
    alter table public.trader_trades add constraint trader_trades_exchange_provider_check
      check (exchange_provider in ('binance','bybit','okx','kraken','kucoin','coinbase'));
  end if;
end $$;

create index if not exists trader_bots_account_exchange_active_idx
  on public.trader_bots(account_id, exchange_provider, status)
  where is_archived = false;

create index if not exists trader_trades_account_exchange_status_idx
  on public.trader_trades(account_id, exchange_provider, status);
