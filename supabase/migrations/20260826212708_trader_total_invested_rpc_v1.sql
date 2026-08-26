create or replace function public.trader_trade_total_invested(p_trade_client_id text)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select t.total_invested
  from public.trader_trades t
  join public.trader_accounts a on a.id = t.account_id
  where t.client_id = p_trade_client_id
    and a.owner_user_id = auth.uid()
  limit 1
$$;

revoke all on function public.trader_trade_total_invested(text) from public, anon;
grant execute on function public.trader_trade_total_invested(text) to authenticated;
