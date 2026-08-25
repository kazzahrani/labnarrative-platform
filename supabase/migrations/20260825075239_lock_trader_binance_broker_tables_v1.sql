alter table public.trader_binance_connections enable row level security;
alter table public.trader_execution_controls enable row level security;
alter table public.trader_gateway_config enable row level security;
alter table public.trader_broker_events enable row level security;

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
