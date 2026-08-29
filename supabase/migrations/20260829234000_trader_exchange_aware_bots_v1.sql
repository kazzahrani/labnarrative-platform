alter table public.trader_bots
  add column if not exists exchange_provider text not null default 'binance';

alter table public.trader_trades
  add column if not exists exchange_provider text not null default 'binance';

update public.trader_bots
set client_state = jsonb_set(
  coalesce(client_state, '{}'::jsonb),
  '{exchangeProvider}',
  to_jsonb(exchange_provider),
  true
)
where coalesce(client_state->>'exchangeProvider', '') = '';

update public.trader_trades
set client_state = jsonb_set(
  coalesce(client_state, '{}'::jsonb),
  '{exchangeProvider}',
  to_jsonb(exchange_provider),
  true
)
where coalesce(client_state->>'exchangeProvider', '') = '';

create index if not exists trader_bots_account_exchange_idx
  on public.trader_bots(account_id, exchange_provider);

create index if not exists trader_trades_account_exchange_idx
  on public.trader_trades(account_id, exchange_provider);
