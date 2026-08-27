alter table public.trader_bots
  add column if not exists tradingview_token text,
  add column if not exists tradingview_enabled boolean not null default false;

create unique index if not exists trader_bots_tradingview_token_uidx
  on public.trader_bots (tradingview_token)
  where tradingview_token is not null;

create table if not exists public.trader_tradingview_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  bot_id uuid not null references public.trader_bots(id) on delete cascade,
  action text not null check (action in ('start','close','add_funds')),
  pair text not null,
  amount numeric(24,12),
  signal_id text,
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed','ignored')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists trader_tradingview_events_dedupe_uidx
  on public.trader_tradingview_events (bot_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists trader_tradingview_events_pending_idx
  on public.trader_tradingview_events (status, received_at);

alter table public.trader_tradingview_events enable row level security;
revoke all on table public.trader_tradingview_events from anon, authenticated;

comment on column public.trader_bots.tradingview_token is 'Per-bot secret used only to authenticate TradingView webhook messages.';
comment on column public.trader_bots.tradingview_enabled is 'Whether the bot accepts TradingView webhook commands.';
comment on table public.trader_tradingview_events is 'Service-only audit/idempotency ledger for TradingView commands.';
