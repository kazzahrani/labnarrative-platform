alter table private.performance_trade_marks
  add column if not exists opening_mark_source text not null default 'system',
  add column if not exists closing_mark_source text;

alter table private.performance_trade_marks
  drop constraint if exists performance_trade_marks_opening_mark_source_check;
alter table private.performance_trade_marks
  add constraint performance_trade_marks_opening_mark_source_check
  check (opening_mark_source in ('live_quote','last_verifiable','exchange_fill','loaded_snapshot','system'));

alter table private.performance_trade_marks
  drop constraint if exists performance_trade_marks_closing_mark_source_check;
alter table private.performance_trade_marks
  add constraint performance_trade_marks_closing_mark_source_check
  check (closing_mark_source is null or closing_mark_source in ('live_quote','last_verifiable','exchange_fill','system'));

create or replace function public.performance_open_period_with_marks_internal(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_spot_balance_usd numeric,
  p_eligibility_snapshot jsonb,
  p_marks jsonb
)
returns private.performance_periods
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_period private.performance_periods%rowtype;
  v_item jsonb;
  v_trade public.trading_trades%rowtype;
  v_trade_id uuid;
  v_price numeric;
  v_source text;
  v_cumulative numeric;
  v_missing integer;
begin
  v_period := public.performance_open_period_internal(
    p_user_id,p_period_start,p_period_end,p_spot_balance_usd,p_eligibility_snapshot
  );
  if v_period.status <> 'open' then return v_period; end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' then p_marks := '[]'::jsonb; end if;

  for v_item in select value from jsonb_array_elements(p_marks)
  loop
    begin v_trade_id := (v_item->>'tradeId')::uuid;
    exception when others then raise exception 'performance_mark_trade_id_invalid'; end;
    v_price := nullif(v_item->>'markPrice','')::numeric;
    v_source := coalesce(nullif(v_item->>'source',''),'live_quote');
    if v_price is null or v_price <= 0 then raise exception 'performance_mark_price_invalid'; end if;
    if v_source not in ('live_quote','last_verifiable','exchange_fill','loaded_snapshot','system') then
      raise exception 'performance_mark_source_invalid';
    end if;

    select * into v_trade
    from public.trading_trades
    where id=v_trade_id and user_id=p_user_id and execution_mode='live' and status='active'
    for update;
    if not found then continue; end if;

    v_cumulative := coalesce(v_trade.realized_pnl,0)
      + coalesce(v_trade.quantity,0) * (v_price-coalesce(v_trade.average_price,v_price));

    insert into private.performance_trade_marks(
      period_id,user_id,trade_id,connection_id,pair,baseline_reason,
      opening_cumulative_pnl_quote,opening_mark_price,opening_marked_at,opening_mark_source
    )
    values(
      v_period.id,p_user_id,v_trade.id,v_trade.connection_id,v_trade.pair,'period_start',
      v_cumulative,v_price,p_period_start,v_source
    )
    on conflict(period_id,trade_id) do nothing;
  end loop;

  select count(*) into v_missing
  from public.trading_trades t
  where t.user_id=p_user_id and t.execution_mode='live' and t.status='active' and t.opened_at < p_period_end
    and not exists (
      select 1 from private.performance_trade_marks m
      where m.period_id=v_period.id and m.trade_id=t.id
    );
  if v_missing > 0 then raise exception 'performance_period_start_marks_incomplete:%',v_missing; end if;
  return v_period;
end;
$$;

create or replace function public.performance_finalize_period_with_marks_internal(
  p_period_id uuid,
  p_marks jsonb
)
returns private.performance_periods
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_period private.performance_periods%rowtype;
  v_mark private.performance_trade_marks%rowtype;
  v_trade public.trading_trades%rowtype;
  v_item jsonb;
  v_marks jsonb := coalesce(p_marks,'[]'::jsonb);
  v_price numeric;
  v_source text;
  v_cumulative numeric;
  v_net numeric;
  v_charge numeric;
begin
  if jsonb_typeof(v_marks) <> 'array' then raise exception 'performance_marks_invalid'; end if;

  select * into v_period from private.performance_periods where id=p_period_id for update;
  if not found then raise exception 'performance_period_not_found'; end if;
  if v_period.status in ('finalized','payment_due','paid','payment_failed','void') then return v_period; end if;
  if v_period.status not in ('open','finalizing') then raise exception 'performance_period_not_finalizable'; end if;

  update private.performance_periods set status='finalizing',updated_at=now()
  where id=p_period_id returning * into v_period;

  for v_mark in
    select * from private.performance_trade_marks
    where period_id=p_period_id and closing_marked_at is null
    order by opening_marked_at,id
    for update
  loop
    select * into v_trade from public.trading_trades where id=v_mark.trade_id;
    if not found then raise exception 'performance_trade_missing:%',v_mark.trade_id; end if;

    if v_trade.status='closed' then
      v_price := coalesce(nullif(v_trade.exit_price,0),nullif(v_trade.last_price,0),nullif(v_trade.average_price,0));
      v_source := 'exchange_fill';
      v_cumulative := coalesce(v_trade.realized_pnl,0);
    else
      select value into v_item
      from jsonb_array_elements(v_marks)
      where value->>'tradeId'=v_mark.trade_id::text
      limit 1;
      if v_item is not null then
        v_price := nullif(v_item->>'markPrice','')::numeric;
        v_source := coalesce(nullif(v_item->>'source',''),'live_quote');
      else
        v_price := nullif(v_trade.last_price,0);
        v_source := 'last_verifiable';
      end if;
      if v_price is null or v_price <= 0 then raise exception 'performance_period_end_mark_unavailable:%',v_mark.trade_id; end if;
      if v_source not in ('live_quote','last_verifiable','exchange_fill','system') then raise exception 'performance_mark_source_invalid'; end if;
      v_cumulative := coalesce(v_trade.realized_pnl,0)
        + coalesce(v_trade.quantity,0) * (v_price-coalesce(v_trade.average_price,v_price));
    end if;

    update private.performance_trade_marks
    set closing_cumulative_pnl_quote=v_cumulative,closing_mark_price=v_price,
        closing_marked_at=v_period.period_end,closing_reason='period_end',
        closing_mark_source=v_source,updated_at=now()
    where id=v_mark.id;
  end loop;

  select coalesce(sum(closing_cumulative_pnl_quote-opening_cumulative_pnl_quote),0)
  into v_net from private.performance_trade_marks where period_id=p_period_id;

  v_charge := round(least(greatest(v_net,0),v_period.monthly_charge_cap_usd),2);

  update private.performance_periods
  set status='finalized',net_pnl_quote=v_net,charge_usd=v_charge,finalized_at=now(),updated_at=now()
  where id=p_period_id returning * into v_period;
  return v_period;
end;
$$;

create or replace function public.performance_status_internal(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'config',jsonb_build_object(
      'enabled',c.enabled,
      'minimumSpotBalanceUsd',c.minimum_spot_balance_usd,
      'monthlyChargeCapUsd',c.monthly_charge_cap_usd,
      'settlementQuoteAsset',c.settlement_quote_asset
    ),
    'period',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'periodStart',p.period_start,'periodEnd',p.period_end,'status',p.status,
      'eligibilitySpotBalanceUsd',p.eligibility_spot_balance_usd,
      'netPnlQuote',p.net_pnl_quote,'chargeUsd',p.charge_usd,'finalizedAt',p.finalized_at
    ) end
  )
  from private.performance_plan_config c
  left join lateral (
    select * from private.performance_periods pp
    where pp.user_id=p_user_id order by pp.period_start desc limit 1
  ) p on true
  where c.singleton=true
$$;

revoke all on function public.performance_open_period_with_marks_internal(uuid,timestamptz,timestamptz,numeric,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.performance_finalize_period_with_marks_internal(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.performance_status_internal(uuid) from public,anon,authenticated;
grant execute on function public.performance_open_period_with_marks_internal(uuid,timestamptz,timestamptz,numeric,jsonb,jsonb) to service_role;
grant execute on function public.performance_finalize_period_with_marks_internal(uuid,jsonb) to service_role;
grant execute on function public.performance_status_internal(uuid) to service_role;
