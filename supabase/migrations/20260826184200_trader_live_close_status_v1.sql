alter table public.trader_trades drop constraint if exists trader_trades_status_check;
alter table public.trader_trades add constraint trader_trades_status_check
  check (status = any (array['Active'::text,'Closing'::text,'Closed'::text]));
