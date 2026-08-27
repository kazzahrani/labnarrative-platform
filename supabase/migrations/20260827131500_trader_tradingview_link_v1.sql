alter table public.trader_bots
  add column if not exists tradingview_token text,
  add column if not exists tradingview_enabled boolean not null default false;

create unique index if not exists trader_bots_tradingview_token_uidx
  on public.trader_bots(tradingview_token)
  where tradingview_token is not null;

create table if not exists public.trader_tradingview_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  bot_id uuid not null references public.trader_bots(id) on delete cascade,
  action text not null check (action in ('START','CLOSE','ADD_FUNDS')),
  pair text not null,
  nonce text not null,
  amount numeric(28,12),
  status text not null default 'received' check(status in ('received','executed','ignored','failed')),
  error text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  executed_at timestamptz
);

create unique index if not exists trader_tradingview_events_nonce_uidx
  on public.trader_tradingview_events(bot_id, nonce);
create index if not exists trader_tradingview_events_bot_idx
  on public.trader_tradingview_events(bot_id, received_at desc);

revoke all on table public.trader_tradingview_events from anon, authenticated;
grant all on table public.trader_tradingview_events to service_role;
