revoke all on function public.trader_bot_analytics_detail(uuid,uuid,timestamptz) from anon;
revoke all on function public.trader_bot_analytics_detail(uuid,uuid,timestamptz) from public;
grant execute on function public.trader_bot_analytics_detail(uuid,uuid,timestamptz) to authenticated;
