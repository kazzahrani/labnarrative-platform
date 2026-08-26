alter table public.trader_orders drop constraint if exists trader_orders_status_check;
alter table public.trader_orders add constraint trader_orders_status_check
  check (status = any (array['PENDING'::text,'OPEN'::text,'NEW'::text,'PARTIALLY_FILLED'::text,'FILLED'::text,'CANCELLED'::text,'CANCELED'::text,'REJECTED'::text,'EXPIRED'::text,'EXPIRED_IN_MATCH'::text]));
