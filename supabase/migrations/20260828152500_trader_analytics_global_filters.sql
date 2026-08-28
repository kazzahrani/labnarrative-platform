create or replace function public.trader_analytics_filtered_summary(
  p_account_id uuid,
  p_range text default '30d',
  p_scope text default 'all',
  p_type text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_range text := case when p_range in ('7d','30d','90d','ytd','all') then p_range else '30d' end;
  v_scope text := case when p_scope in ('all','running','paused','archived') then p_scope else 'all' end;
  v_type text := case when p_type in ('all','DCA','Strategy Execution') then p_type else 'all' end;
  v_since timestamptz;
  v_result jsonb;
begin
  select owner_user_id into v_owner
  from public.trader_accounts
  where id = p_account_id and status = 'active';

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  v_since := case
    when v_range = '7d' then now() - interval '7 days'
    when v_range = '30d' then now() - interval '30 days'
    when v_range = '90d' then now() - interval '90 days'
    when v_range = 'ytd' then date_trunc('year', now())
    else null
  end;

  with eligible_bots as (
    select
      b.id,
      b.name,
      b.status,
      b.is_archived,
      case when coalesce(b.client_state->>'automationType','') = 'tradingview_strategy'
        then 'Strategy Execution' else 'DCA' end as bot_type
    from public.trader_bots b
    where b.account_id = p_account_id
  ), filtered_bots as (
    select * from eligible_bots b
    where
      (v_scope = 'all'
        or (v_scope = 'running' and not b.is_archived and b.status = 'Running')
        or (v_scope = 'paused' and not b.is_archived and b.status <> 'Running')
        or (v_scope = 'archived' and b.is_archived))
      and (v_type = 'all' or b.bot_type = v_type)
  ), closed as (
    select
      t.id,
      t.bot_id,
      coalesce(t.realized_pnl,0)::numeric as pnl,
      greatest(0,coalesce(t.total_invested,t.invested,0))::numeric as capital,
      coalesce(t.closed_at,t.opened_at,t.created_at) as at
    from public.trader_trades t
    join filtered_bots b on b.id = t.bot_id
    where t.account_id = p_account_id
      and t.status = 'Closed'
      and (v_since is null or t.closed_at >= v_since)
  ), ordered as (
    select
      c.*,
      sum(c.pnl) over(order by c.at,c.id rows between unbounded preceding and current row) as cumulative
    from closed c
  ), equity as (
    select
      o.*,
      greatest(0,max(o.cumulative) over(order by o.at,o.id rows between unbounded preceding and current row)) as peak
    from ordered o
  ), numbered as (
    select e.*,row_number() over(order by e.at,e.id) as rn,count(*) over() as cnt
    from equity e
  ), sampled as (
    select at,pnl,cumulative,rn,cnt
    from numbered
    where cnt <= 220
      or rn = 1
      or rn = cnt
      or mod((rn-1)::int,greatest(1,ceil(cnt/220.0)::int)) = 0
    order by rn
  ), totals as (
    select
      coalesce(sum(pnl),0)::numeric as pnl,
      coalesce(sum(capital),0)::numeric as capital,
      count(*)::int as trades,
      count(*) filter(where pnl > 0)::int as wins,
      count(*) filter(where pnl < 0)::int as losses,
      count(*) filter(where pnl = 0)::int as breakeven,
      coalesce(sum(pnl) filter(where pnl > 0),0)::numeric as gross_profit,
      abs(coalesce(sum(pnl) filter(where pnl < 0),0))::numeric as gross_loss
    from closed
  ), dd as (
    select coalesce(max(peak-cumulative),0)::numeric as max_drawdown from equity
  ), active as (
    select count(*)::int as count
    from public.trader_trades t
    join filtered_bots b on b.id = t.bot_id
    where t.account_id = p_account_id and t.status = 'Active'
  ), bot_pnl as (
    select b.id,b.name,sum(c.pnl)::numeric as pnl
    from filtered_bots b
    join closed c on c.bot_id = b.id
    group by b.id,b.name
    order by pnl desc
    limit 1
  ), bot_ids as (
    select coalesce(jsonb_agg(id order by id),'[]'::jsonb) as value from filtered_bots
  ), series_json as (
    select coalesce(jsonb_agg(jsonb_build_object('at',at,'pnl',pnl,'cumulative',cumulative) order by rn),'[]'::jsonb) as value
    from sampled
  ), counts as (
    select count(*)::int as total,count(*) filter(where not is_archived and status='Running')::int as running
    from filtered_bots
  )
  select jsonb_build_object(
    'range',v_range,
    'scope',v_scope,
    'type',v_type,
    'botIds',bot_ids.value,
    'summary',jsonb_build_object(
      'realizedPnl',totals.pnl,
      'realizedRoi',case when totals.capital > 0 then totals.pnl/totals.capital*100 else null end,
      'closedTrades',totals.trades,
      'activePositions',active.count,
      'winRate',case when totals.trades > 0 then totals.wins::numeric/totals.trades*100 else null end,
      'profitFactor',case when totals.gross_loss > 0 then totals.gross_profit/totals.gross_loss else null end,
      'maxDrawdown',dd.max_drawdown,
      'wins',totals.wins,
      'losses',totals.losses,
      'breakeven',totals.breakeven,
      'runningAutomations',counts.running,
      'automationCount',counts.total,
      'bestAutomation',case when bot_pnl.id is null then null else jsonb_build_object('id',bot_pnl.id,'name',bot_pnl.name,'pnl',bot_pnl.pnl) end
    ),
    'series',series_json.value
  ) into v_result
  from totals cross join dd cross join active cross join bot_ids cross join series_json cross join counts
  left join bot_pnl on true;

  return coalesce(v_result,jsonb_build_object('botIds','[]'::jsonb,'summary',jsonb_build_object(),'series','[]'::jsonb));
end;
$$;

revoke all on function public.trader_analytics_filtered_summary(uuid,text,text,text) from public;
grant execute on function public.trader_analytics_filtered_summary(uuid,text,text,text) to authenticated;
