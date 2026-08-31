create or replace function public.trader_v2_apply_exit_plan_command(
  p_command_id uuid,
  p_worker_id uuid,
  p_stop_enabled boolean,
  p_stop_pct numeric,
  p_take_profit_targets jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_command public.trader_v2_commands%rowtype;
  v_trade public.trader_trades%rowtype;
  v_state jsonb;
  v_provider text;
  v_now timestamptz := now();
  v_targets jsonb := p_take_profit_targets;
  v_target_count integer := 0;
  v_alloc numeric := 0;
  v_single_pct numeric := null;
  v_result jsonb;
begin
  select * into v_command from public.trader_v2_commands
  where id=p_command_id and mode='execute' and command_type='position.update_exit_plan'
    and status='running' and worker_lock_id=p_worker_id for update;
  if not found then raise exception 'command_not_running'; end if;
  if v_command.target_type<>'position' or coalesce(v_command.target_id,'')='' then raise exception 'invalid_command_target'; end if;
  if not exists(select 1 from public.trader_accounts a where a.id=v_command.account_id and a.exit_worker_lock_id=p_worker_id and a.exit_worker_locked_until>now()) then
    raise exception 'exit_lock_required';
  end if;

  select * into v_trade from public.trader_trades
  where id=v_command.target_id::uuid and account_id=v_command.account_id for update;
  if not found then raise exception 'position_not_found'; end if;
  if v_trade.status<>'Active' then raise exception 'position_not_active'; end if;
  if v_trade.execution_mode<>'live' then raise exception 'position_not_live'; end if;

  v_state := coalesce(v_trade.client_state,'{}'::jsonb);
  if coalesce((v_state->>'exitStrategyV2')::boolean,false) is not true then raise exception 'exit_strategy_v2_required'; end if;
  if coalesce(p_stop_enabled,false) and not (coalesce(p_stop_pct,0)>0) then raise exception 'invalid_stop_loss'; end if;

  if v_targets is not null then
    if jsonb_typeof(v_targets)<>'array' then raise exception 'invalid_take_profit_targets'; end if;
    v_target_count := jsonb_array_length(v_targets);
    if v_target_count>8 then raise exception 'invalid_take_profit_targets'; end if;
    if v_target_count>0 then
      begin
        if (select count(*) from jsonb_array_elements(v_targets) item
            where not ((item->>'profitPct')::numeric>0 and (item->>'allocationPct')::numeric>0 and (item->>'allocationPct')::numeric<=100))>0 then
          raise exception 'invalid_take_profit_targets';
        end if;
        select coalesce(sum((item->>'allocationPct')::numeric),0) into v_alloc from jsonb_array_elements(v_targets) item;
      exception when invalid_text_representation then
        raise exception 'invalid_take_profit_targets';
      end;
      if abs(v_alloc-100)>0.011 then raise exception 'take_profit_allocation_must_equal_100'; end if;
      if v_target_count=1 then v_single_pct := (v_targets->0->>'profitPct')::numeric; else v_single_pct := 0; end if;
    else
      v_single_pct := 0;
    end if;
  end if;

  v_provider := lower(coalesce(nullif(v_trade.exchange_provider,''),nullif(v_state->>'exchangeProvider',''),nullif(v_state->>'exchange',''),'binance'));
  v_state := v_state || jsonb_build_object(
    'exitStrategyV2',true,'manualEditAt',v_now,'exchange',v_provider,'exchangeProvider',v_provider,
    'stopEnabled',coalesce(p_stop_enabled,false),'stopPct',coalesce(p_stop_pct,0)
  );
  v_state := v_state - 'stopLossTriggeredAt';
  if v_targets is not null then
    v_state := v_state || jsonb_build_object('takeProfitTargets',v_targets,'takeProfitFilled','[]'::jsonb,'takeProfitPlanUpdatedAt',v_now);
  end if;

  update public.trader_trades
  set stop_enabled=false,
      stop_pct=coalesce(p_stop_pct,0),
      take_profit_pct=case when v_targets is null then take_profit_pct else v_single_pct end,
      client_state=v_state,
      updated_at=v_now
  where id=v_trade.id;

  v_result := jsonb_build_object(
    'executed',true,'noOrderSent',true,'commandType','position.update_exit_plan',
    'positionId',v_trade.id,'clientId',v_trade.client_id,'pair',v_trade.pair,'provider',v_provider,
    'stopEnabled',coalesce(p_stop_enabled,false),'stopPct',coalesce(p_stop_pct,0),
    'takeProfitUpdated',v_targets is not null,
    'takeProfitTargets',coalesce(v_targets,v_state->'takeProfitTargets','[]'::jsonb),'appliedAt',v_now
  );

  insert into public.trader_broker_events(account_id,bot_id,trade_id,order_id,mode,event_type,pair,client_order_id,exchange_order_id,payload)
  values(v_command.account_id,v_trade.bot_id,v_trade.id,null,'live','manual_exit_plan_updated_v2_command',v_trade.pair,null,null,
    v_result || jsonb_build_object('commandId',v_command.id,'coreV2Command',true));

  update public.trader_v2_commands
  set status='succeeded',result=v_result,error_code=null,finished_at=v_now,
      worker_lock_id=null,worker_locked_until=null,next_attempt_at=null
  where id=v_command.id;
  insert into public.trader_v2_command_events(command_id,owner_user_id,event_type,details)
  values(v_command.id,v_command.owner_user_id,'succeeded',v_result);
  return v_result;
end;
$function$;

revoke all on function public.trader_v2_apply_exit_plan_command(uuid,uuid,boolean,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.trader_v2_apply_exit_plan_command(uuid,uuid,boolean,numeric,jsonb) to service_role;
