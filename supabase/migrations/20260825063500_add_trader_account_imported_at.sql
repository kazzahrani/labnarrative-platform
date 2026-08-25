alter table public.trader_accounts
add column if not exists imported_at timestamptz null;

comment on column public.trader_accounts.imported_at is
  'Timestamp when browser-local trader state was durably imported into the server engine.';
