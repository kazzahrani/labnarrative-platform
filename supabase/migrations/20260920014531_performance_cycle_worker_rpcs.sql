create or replace function public.performance_due_periods_internal(p_limit integer default 25)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public,private
as $$
  select coalesce(jsonb_agg(jsonb_build_object('periodId',p.id,'userId',p.user_id,'periodStart',p.period_start,'periodEnd',p.period_end,'status',p.status) order by p.period_end asc),'[]'::jsonb)
  from (select * from private.performance_periods where status='open' and period_end<=now() order by period_end asc limit greatest(1,least(coalesce(p_limit,25),100))) p
$$;
create or replace function public.performance_period_trade_context_internal(p_period_id uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public,private
as $$
  select coalesce(jsonb_agg(jsonb_build_object('tradeId',t.id,'userId',t.user_id,'connectionId',t.connection_id,'provider',t.exchange_provider,'pair',t.pair,'status',t.status,'lastPrice',t.last_price,'averagePrice',t.average_price,'quantity',t.quantity,'realizedPnl',t.realized_pnl,'openedAt',t.opened_at) order by t.id),'[]'::jsonb)
  from private.performance_trade_marks m join public.trading_trades t on t.id=m.trade_id
  where m.period_id=p_period_id and m.closing_marked_at is null
$$;
revoke all on function public.performance_due_periods_internal(integer) from public,anon,authenticated;
revoke all on function public.performance_period_trade_context_internal(uuid) from public,anon,authenticated;
grant execute on function public.performance_due_periods_internal(integer) to service_role;
grant execute on function public.performance_period_trade_context_internal(uuid) to service_role;