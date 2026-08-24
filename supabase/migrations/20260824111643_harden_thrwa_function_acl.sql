revoke execute on function public.ensure_wealth_paper_portfolio() from public, anon;
grant execute on function public.ensure_wealth_paper_portfolio() to authenticated, service_role;

revoke execute on function public.wealth_binance_ledger_cost(uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.wealth_binance_ledger_cost(uuid,text,numeric) to service_role;

revoke execute on function public.wealth_connected_price_integrity() from public, anon, authenticated;
grant execute on function public.wealth_connected_price_integrity() to service_role;
