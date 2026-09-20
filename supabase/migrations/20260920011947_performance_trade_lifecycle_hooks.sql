create or replace function private.capture_performance_trade_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_period private.performance_periods%rowtype;
  v_mark private.performance_trade_marks%rowtype;
  v_price numeric;
  v_cumulative numeric;
  v_loaded boolean;
  v_accounting_ready boolean;
  v_reason text;
begin
  if new.execution_mode <> 'live' then return new; end if;

  select * into v_period
  from private.performance_periods
  where user_id = new.user_id
    and status = 'open'
    and new.opened_at < period_end
    and now() >= period_start
  order by period_start desc
  limit 1;

  if not found then return new; end if;

  v_price := coalesce(nullif(new.last_price,0), nullif(new.entry_price,0), nullif(new.average_price,0));
  if v_price is null or v_price <= 0 then return new; end if;

  v_loaded := coalesce((new.strategy_snapshot->>'loadedTrade')::boolean,false);
  v_accounting_ready := coalesce(new.strategy_snapshot->>'accountingVersion','') = 'net-pnl-v1';

  if tg_op = 'INSERT' then
    if not v_loaded then
      insert into private.performance_trade_marks(
        period_id,user_id,trade_id,connection_id,pair,baseline_reason,
        opening_cumulative_pnl_quote,opening_mark_price,opening_marked_at
      ) values (
        v_period.id,new.user_id,new.id,new.connection_id,new.pair,'trade_created',
        0,v_price,coalesce(new.opened_at,now())
      )
      on conflict (period_id,trade_id) do nothing;
    end if;
    return new;
  end if;

  if v_loaded
     and v_accounting_ready
     and coalesce(old.strategy_snapshot->>'accountingVersion','') <> 'net-pnl-v1' then
    v_cumulative :=
      coalesce(new.realized_pnl,0)
      + case when new.status='active'
          then coalesce(new.quantity,0) * (v_price - coalesce(new.average_price,v_price))
          else 0 end;

    insert into private.performance_trade_marks(
      period_id,user_id,trade_id,connection_id,pair,baseline_reason,
      opening_cumulative_pnl_quote,opening_mark_price,opening_marked_at
    ) values (
      v_period.id,new.user_id,new.id,new.connection_id,new.pair,'loaded_existing',
      v_cumulative,v_price,now()
    )
    on conflict (period_id,trade_id) do nothing;
  end if;

  if old.status = 'active' and new.status = 'closed' then
    select * into v_mark
    from private.performance_trade_marks
    where period_id=v_period.id and trade_id=new.id and closing_marked_at is null
    for update;

    if found then
      if lower(coalesce(new.close_reason,'')) in ('manual_unmanaged','cancelled')
         or lower(coalesce(new.close_reason,'')) like '%management cancel%' then
        v_reason := 'management_cancelled';
        v_price := coalesce(nullif(new.last_price,0), nullif(old.last_price,0), nullif(old.average_price,0));
        v_cumulative :=
          coalesce(old.realized_pnl,0)
          + coalesce(old.quantity,0) * (v_price - coalesce(old.average_price,v_price));
      else
        v_reason := 'trade_closed';
        v_price := coalesce(nullif(new.exit_price,0), nullif(new.last_price,0), nullif(old.last_price,0), nullif(new.average_price,0));
        v_cumulative := coalesce(new.realized_pnl,0);
      end if;

      if v_price is not null and v_price > 0 then
        update private.performance_trade_marks
        set closing_cumulative_pnl_quote=v_cumulative,
            closing_mark_price=v_price,
            closing_marked_at=coalesce(new.closed_at,now()),
            closing_reason=v_reason,
            updated_at=now()
        where id=v_mark.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_performance_trade_lifecycle() from public, anon, authenticated;
grant execute on function private.capture_performance_trade_lifecycle() to service_role;

drop trigger if exists trg_capture_performance_trade_lifecycle on public.trading_trades;
create trigger trg_capture_performance_trade_lifecycle
after insert or update of status, realized_pnl, last_price, strategy_snapshot
on public.trading_trades
for each row
execute function private.capture_performance_trade_lifecycle();

create or replace function public.performance_crystallize_trade_if_open_internal(
  p_user_id uuid,
  p_trade_id uuid,
  p_mark_price numeric,
  p_closing_reason text default 'manual_crystallization'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_period private.performance_periods%rowtype;
  v_mark private.performance_trade_marks%rowtype;
  v_trade public.trading_trades%rowtype;
  v_cumulative numeric;
begin
  if p_mark_price is null or p_mark_price <= 0 then raise exception 'performance_mark_price_invalid'; end if;
  if p_closing_reason not in ('management_cancelled','exchange_disconnect','manual_crystallization') then
    raise exception 'performance_closing_reason_invalid';
  end if;

  select * into v_period
  from private.performance_periods
  where user_id=p_user_id and status='open' and now()>=period_start and now()<period_end
  order by period_start desc
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'performance',false,'reason','no_open_performance_period');
  end if;

  select * into v_mark
  from private.performance_trade_marks
  where period_id=v_period.id and trade_id=p_trade_id
  for update;

  if not found then
    return jsonb_build_object('ok',true,'performance',true,'crystallized',false,'reason','trade_not_in_period');
  end if;
  if v_mark.closing_marked_at is not null then
    return jsonb_build_object('ok',true,'performance',true,'crystallized',true,'alreadyCrystallized',true);
  end if;

  select * into v_trade
  from public.trading_trades
  where id=p_trade_id and user_id=p_user_id;

  if not found then raise exception 'performance_trade_not_found'; end if;

  v_cumulative :=
    coalesce(v_trade.realized_pnl,0)
    + case when v_trade.status='active'
        then coalesce(v_trade.quantity,0) * (p_mark_price - coalesce(v_trade.average_price,p_mark_price))
        else 0 end;

  update private.performance_trade_marks
  set closing_cumulative_pnl_quote=v_cumulative,
      closing_mark_price=p_mark_price,
      closing_marked_at=now(),
      closing_reason=p_closing_reason,
      updated_at=now()
  where id=v_mark.id;

  return jsonb_build_object(
    'ok',true,'performance',true,'crystallized',true,
    'periodId',v_period.id,'tradeId',p_trade_id,'markPrice',p_mark_price,
    'cumulativePnl',v_cumulative,
    'periodContribution',v_cumulative-v_mark.opening_cumulative_pnl_quote
  );
end;
$$;

revoke all on function public.performance_crystallize_trade_if_open_internal(uuid,uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.performance_crystallize_trade_if_open_internal(uuid,uuid,numeric,text) to service_role;
