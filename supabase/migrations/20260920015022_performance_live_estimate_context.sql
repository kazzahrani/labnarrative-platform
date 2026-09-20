create or replace function public.performance_current_estimate_context_internal(p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,private
as $$
declare v_period private.performance_periods%rowtype; v_rows jsonb;
begin
  select * into v_period from private.performance_periods
  where user_id=p_user_id and status='open' and now()>=period_start and now()<period_end
  order by period_start desc limit 1;
  if not found then return jsonb_build_object('period',null,'trades','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'tradeId',m.trade_id,'pair',m.pair,'provider',t.exchange_provider,'tradeStatus',t.status,
    'openingCumulativePnl',m.opening_cumulative_pnl_quote,'openingMarkPrice',m.opening_mark_price,
    'closingCumulativePnl',m.closing_cumulative_pnl_quote,'closingMarkPrice',m.closing_mark_price,
    'closingMarkedAt',m.closing_marked_at,'realizedPnl',t.realized_pnl,'quantity',t.quantity,
    'averagePrice',t.average_price,'lastPrice',t.last_price
  ) order by m.opening_marked_at,m.id),'[]'::jsonb)
  into v_rows
  from private.performance_trade_marks m join public.trading_trades t on t.id=m.trade_id
  where m.period_id=v_period.id;
  return jsonb_build_object(
    'period',jsonb_build_object('id',v_period.id,'periodStart',v_period.period_start,'periodEnd',v_period.period_end,'monthlyChargeCapUsd',v_period.monthly_charge_cap_usd,'eligibilitySpotBalanceUsd',v_period.eligibility_spot_balance_usd),
    'trades',v_rows
  );
end;
$$;
revoke all on function public.performance_current_estimate_context_internal(uuid) from public,anon,authenticated;
grant execute on function public.performance_current_estimate_context_internal(uuid) to service_role;