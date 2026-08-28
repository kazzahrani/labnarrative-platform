create or replace function public.trader_bot_analytics_detail(
  p_account_id uuid,
  p_bot_id uuid,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_is_strategy boolean := false;
  v_result jsonb;
begin
  select owner_user_id into v_owner
  from public.trader_accounts
  where id = p_account_id and status = 'active';

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select coalesce(client_state->>'automationType','') = 'tradingview_strategy'
    into v_is_strategy
  from public.trader_bots
  where id = p_bot_id and account_id = p_account_id;

  if not found then
    raise exception 'automation_not_found';
  end if;

  with closed as (
    select id, pair, coalesce(realized_pnl,0)::numeric as pnl,
      coalesce(total_invested, invested, 0)::numeric as capital,
      coalesce(averaging_filled,0)::int as depth,
      coalesce(close_reason,'Other') as close_reason,
      opened_at, closed_at, entry_price::numeric, average_price::numeric, exit_price::numeric,
      case when coalesce(total_invested, invested, 0) > 0 then coalesce(realized_pnl,0) / coalesce(total_invested, invested, 0) * 100 else null end as roi,
      case when opened_at is not null and closed_at is not null then extract(epoch from (closed_at-opened_at))/60.0 else null end as duration_minutes
    from public.trader_trades
    where account_id = p_account_id and bot_id = p_bot_id and status = 'Closed'
      and (p_since is null or closed_at >= p_since)
  ), recent as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'pair',pair,'pnl',pnl,'roi',roi,'capital',capital,'averagingFilled',depth,
      'durationMinutes',duration_minutes,'closeReason',close_reason,'openedAt',opened_at,'closedAt',closed_at,
      'entryPrice',entry_price,'averagePrice',average_price,'exitPrice',exit_price
    ) order by closed_at desc),'[]'::jsonb) as value
    from (select * from closed order by closed_at desc limit 150) x
  ), depth_rows as (
    select depth,count(*)::int trades,count(*) filter(where pnl>0)::int wins,sum(pnl)::numeric pnl,avg(pnl)::numeric avg_pnl,avg(duration_minutes)::numeric avg_duration
    from closed group by depth order by depth
  ), depth_json as (
    select coalesce(jsonb_agg(jsonb_build_object('depth',depth,'trades',trades,'wins',wins,'winRate',case when trades>0 then wins::numeric/trades*100 else null end,'pnl',pnl,'avgPnl',avg_pnl,'avgDurationMinutes',avg_duration) order by depth),'[]'::jsonb) value from depth_rows
  ), month_rows as (
    select date_trunc('month',closed_at) month_start,count(*)::int trades,count(*) filter(where pnl>0)::int wins,sum(pnl)::numeric pnl from closed where closed_at is not null group by 1 order by 1
  ), month_json as (
    select coalesce(jsonb_agg(jsonb_build_object('key',to_char(month_start,'YYYY-MM'),'label',to_char(month_start,'Mon YY'),'trades',trades,'wins',wins,'winRate',case when trades>0 then wins::numeric/trades*100 else null end,'pnl',pnl) order by month_start),'[]'::jsonb) value from (select * from month_rows order by month_start desc limit 18) x
  ), weekday_seed(day_index,day_name) as (values (0,'Sun'),(1,'Mon'),(2,'Tue'),(3,'Wed'),(4,'Thu'),(5,'Fri'),(6,'Sat')),
  weekday_rows as (
    select extract(dow from closed_at)::int day_index,count(*)::int trades,count(*) filter(where pnl>0)::int wins,sum(pnl)::numeric pnl from closed where closed_at is not null group by 1
  ), weekday_json as (
    select jsonb_agg(jsonb_build_object('day',s.day_name,'trades',coalesce(w.trades,0),'wins',coalesce(w.wins,0),'winRate',case when coalesce(w.trades,0)>0 then w.wins::numeric/w.trades*100 else null end,'pnl',coalesce(w.pnl,0)) order by s.day_index) value from weekday_seed s left join weekday_rows w using(day_index)
  ), capital_json as (
    select jsonb_build_object('averagePerTrade',avg(capital),'totalUsed',coalesce(sum(capital),0),'capitalDays',coalesce(sum(capital*coalesce(duration_minutes,0)/1440.0),0),'pnlPer1000',case when sum(capital)>0 then sum(pnl)/sum(capital)*1000 else null end,'pnlPerCapitalDay',case when sum(capital*coalesce(duration_minutes,0)/1440.0)>0 then sum(pnl)/sum(capital*coalesce(duration_minutes,0)/1440.0) else null end) value from closed
  ), signal_rows as (
    select status,received_at,processed_at from public.trader_tradingview_events where account_id=p_account_id and bot_id=p_bot_id and (p_since is null or received_at>=p_since)
  ), signal_json as (
    select case when v_is_strategy then jsonb_build_object('received',count(*),'executed',count(*) filter(where status='processed'),'ignored',count(*) filter(where status='ignored'),'failed',count(*) filter(where status='failed'),'processing',count(*) filter(where status not in('processed','ignored','failed')),'executionRate',case when count(*) filter(where status in('processed','ignored','failed'))>0 then count(*) filter(where status='processed')::numeric/count(*) filter(where status in('processed','ignored','failed'))*100 else null end,'avgLatencyMs',avg(extract(epoch from(processed_at-received_at))*1000) filter(where processed_at is not null and received_at is not null)) else null end value from signal_rows
  )
  select jsonb_build_object('recentTrades',recent.value,'dcaDepth',depth_json.value,'monthly',month_json.value,'weekdays',weekday_json.value,'capital',capital_json.value,'signals',signal_json.value)
    into v_result from recent cross join depth_json cross join month_json cross join weekday_json cross join capital_json cross join signal_json;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.trader_bot_analytics_detail(uuid,uuid,timestamptz) from public;
grant execute on function public.trader_bot_analytics_detail(uuid,uuid,timestamptz) to authenticated;
