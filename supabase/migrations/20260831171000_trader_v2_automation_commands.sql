alter table public.trader_v2_commands
  drop constraint if exists trader_v2_commands_type_check;

alter table public.trader_v2_commands
  add constraint trader_v2_commands_type_check check (
    command_type in (
      'system.preflight',
      'automation.create',
      'automation.update',
      'automation.set_status',
      'automation.archive',
      'position.update_exit_plan',
      'position.close',
      'position.add_funds'
    )
  );

create or replace function public.trader_v2_enqueue_automation_command(
  p_owner_user_id uuid,
  p_account_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_command_type text,
  p_target_id uuid,
  p_payload jsonb,
  p_validation jsonb
)
returns table(command_id uuid, command_status text, replayed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.trader_v2_commands%rowtype;
  v_id uuid;
begin
  if p_owner_user_id is null or p_account_id is null then raise exception 'invalid_command_identity'; end if;
  if p_command_type not in ('automation.create','automation.update','automation.set_status','automation.archive') then raise exception 'unsupported_command_type'; end if;
  if p_command_type <> 'automation.create' and p_target_id is null then raise exception 'automation_not_found'; end if;
  if char_length(coalesce(p_idempotency_key,'')) < 8 or char_length(p_idempotency_key) > 160 then raise exception 'invalid_idempotency_key'; end if;
  if not exists (
    select 1 from public.trader_accounts a
    where a.id=p_account_id and a.owner_user_id=p_owner_user_id and a.account_kind='real' and a.status='active'
  ) then raise exception 'trader_account_not_owned'; end if;

  select * into v_existing
  from public.trader_v2_commands
  where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then raise exception 'idempotency_key_reuse'; end if;
    return query select v_existing.id, v_existing.status, true;
    return;
  end if;

  insert into public.trader_v2_commands(
    owner_user_id,account_id,idempotency_key,request_fingerprint,command_type,target_type,target_id,
    payload,mode,status,validation,validated_at
  ) values (
    p_owner_user_id,p_account_id,p_idempotency_key,p_request_fingerprint,p_command_type,'automation',
    case when p_target_id is null then null else p_target_id::text end,
    coalesce(p_payload,'{}'::jsonb),'execute','queued',coalesce(p_validation,'{}'::jsonb),now()
  ) returning id into v_id;

  insert into public.trader_v2_command_events(command_id,owner_user_id,event_type,details) values
    (v_id,p_owner_user_id,'received',jsonb_build_object('commandType',p_command_type,'targetType','automation','targetId',p_target_id,'mode','execute')),
    (v_id,p_owner_user_id,'queued',jsonb_build_object('durable',true,'noOrderSentOnQueue',true));

  return query select v_id,'queued'::text,false;
end;
$$;

create or replace function public.trader_v2_claim_automation_commands(
  p_worker_id uuid,
  p_limit integer default 8,
  p_lease_seconds integer default 45
)
returns setof public.trader_v2_commands
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null then raise exception 'worker_id_required'; end if;
  return query
  with candidates as (
    select c.id
    from public.trader_v2_commands c
    where c.mode='execute'
      and c.command_type in ('automation.create','automation.update','automation.set_status','automation.archive')
      and (
        (c.status='queued' and (c.next_attempt_at is null or c.next_attempt_at<=now()))
        or
        (c.status='running' and (c.worker_locked_until is null or c.worker_locked_until<now()))
      )
    order by c.requested_at asc
    for update skip locked
    limit greatest(1,least(16,coalesce(p_limit,8)))
  )
  update public.trader_v2_commands c
  set status='running',
      worker_lock_id=p_worker_id,
      worker_locked_until=now()+make_interval(secs=>greatest(15,least(120,coalesce(p_lease_seconds,45)))),
      attempt_count=c.attempt_count+1,
      started_at=coalesce(c.started_at,now()),
      next_attempt_at=null,
      error_code=null
  from candidates x
  where c.id=x.id
  returning c.*;
end;
$$;

create or replace function public.trader_v2_apply_automation_command(
  p_command_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command public.trader_v2_commands%rowtype;
  v_account public.trader_accounts%rowtype;
  v_bot public.trader_bots%rowtype;
  v_payload jsonb;
  v_state jsonb;
  v_now timestamptz := now();
  v_name text;
  v_pair text;
  v_status text;
  v_client_id text;
  v_base_order numeric;
  v_safety_order numeric;
  v_max_safety integer;
  v_limit_safety integer;
  v_max_active integer;
  v_deviation numeric;
  v_step_scale numeric;
  v_volume_scale numeric;
  v_take_profit numeric;
  v_stop_enabled boolean;
  v_stop_pct numeric;
  v_execution_mode text;
  v_result jsonb;
begin
  select * into v_command from public.trader_v2_commands
  where id=p_command_id
    and mode='execute'
    and command_type in ('automation.create','automation.update','automation.set_status','automation.archive')
    and status='running'
    and worker_lock_id=p_worker_id
  for update;
  if not found then raise exception 'command_not_running'; end if;

  select * into v_account from public.trader_accounts where id=v_command.account_id for update;
  if not found or v_account.account_kind<>'real' or v_account.status<>'active' then raise exception 'real_account_required'; end if;
  if v_account.worker_lock_id is distinct from p_worker_id or v_account.worker_locked_until is null or v_account.worker_locked_until<=now() then
    raise exception 'account_lock_required';
  end if;
  if v_account.mode not in ('shadow','live') then raise exception 'real_mode_required'; end if;

  v_payload := coalesce(v_command.payload,'{}'::jsonb);

  if v_command.command_type in ('automation.create','automation.update') then
    v_name := trim(coalesce(v_payload->>'name',''));
    v_pair := upper(trim(coalesce(v_payload->>'pair','BTC/USDT')));
    v_base_order := greatest(0,coalesce((v_payload->>'baseOrder')::numeric,0));
    v_safety_order := greatest(0,coalesce((v_payload->>'safetyOrder')::numeric,0));
    v_max_safety := greatest(0,least(50,coalesce((v_payload->>'maxSafetyOrders')::integer,5)));
    v_limit_safety := case when v_max_safety>0 then greatest(1,least(v_max_safety,coalesce((v_payload->>'limitSafetyOrders')::integer,1))) else 0 end;
    v_max_active := greatest(1,least(20,coalesce((v_payload->>'maxActiveTrades')::integer,1)));
    v_deviation := greatest(0.000001,coalesce((v_payload->>'deviation')::numeric,1));
    v_step_scale := greatest(0.000001,coalesce((v_payload->>'stepScale')::numeric,1));
    v_volume_scale := greatest(0.000001,coalesce((v_payload->>'volumeScale')::numeric,1));
    v_take_profit := greatest(0,coalesce((v_payload->>'takeProfit')::numeric,1.5));
    v_stop_enabled := coalesce((v_payload->>'stopEnabled')::boolean,false);
    v_stop_pct := greatest(0,coalesce((v_payload->>'stopPct')::numeric,8));
    if v_name='' then raise exception 'bot_name_required'; end if;
    if v_pair !~ '^[A-Z0-9]{2,16}/USDT$' then raise exception 'invalid_pair'; end if;
    if not (v_base_order>0 and v_safety_order>0) then raise exception 'invalid_order_amount'; end if;
  end if;

  if v_command.command_type='automation.create' then
    if not exists(select 1 from public.trader_binance_connections c where c.account_id=v_account.id and c.status='connected') then
      raise exception 'exchange_connection_required';
    end if;
    v_client_id := 'bot-' || (floor(extract(epoch from clock_timestamp())*1000))::bigint::text || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
    v_execution_mode := case when v_account.mode='live' then 'live' else 'shadow' end;
    v_state := jsonb_build_object(
      'id',v_client_id,'name',v_name,'pair',v_pair,'pairs',jsonb_build_array(v_pair),'allPairs',false,
      'status','Running','direction','Long','baseOrder',v_base_order,'safetyOrder',v_safety_order,
      'maxSafetyOrders',v_max_safety,'limitSafetyOrders',v_limit_safety,'maxActiveTrades',v_max_active,
      'deviation',v_deviation,'stepScale',v_step_scale,'volumeScale',v_volume_scale,'takeProfit',v_take_profit,
      'stopEnabled',v_stop_enabled,'stopPct',v_stop_pct,'trailingPct',0,'maxHoldEnabled',false,
      'averagingEnabled',true,'orderType','Market','conditions','[]'::jsonb,'startCondition','Immediately',
      'createdAt',v_now,'executionMode',v_execution_mode,'coreV2Command',true
    );
    insert into public.trader_bots(
      account_id,client_id,name,status,pair,pairs,all_pairs,base_order,safety_order,max_safety_orders,
      limit_safety_orders,max_active_trades,deviation,step_scale,volume_scale,take_profit_pct,stop_enabled,
      stop_pct,trailing_pct,max_hold_enabled,max_hold_hours,averaging_enabled,order_type,conditions,client_state,
      is_archived,next_scan_at,execution_mode,exchange_provider,created_at,updated_at
    ) values (
      v_account.id,v_client_id,v_name,'Running',v_pair,array[v_pair],false,v_base_order,v_safety_order,v_max_safety,
      v_limit_safety,v_max_active,v_deviation,v_step_scale,v_volume_scale,v_take_profit,v_stop_enabled,
      v_stop_pct,0,false,null,true,'Market','[]'::jsonb,v_state,false,null,v_execution_mode,'binance',v_now,v_now
    ) returning * into v_bot;
    v_result := jsonb_build_object('executed',true,'noOrderSent',true,'commandType',v_command.command_type,'botId',v_bot.id,'clientId',v_bot.client_id,'status',v_bot.status,'appliedAt',v_now);
  else
    if v_command.target_id is null then raise exception 'automation_not_found'; end if;
    select * into v_bot from public.trader_bots
    where id=v_command.target_id::uuid and account_id=v_account.id
    for update;
    if not found then raise exception 'automation_not_found'; end if;
    if v_bot.is_archived=true then raise exception 'bot_closed'; end if;

    if v_command.command_type='automation.update' then
      if v_pair<>v_bot.pair and exists(select 1 from public.trader_trades t where t.account_id=v_account.id and t.bot_id=v_bot.id and t.status='Active') then
        raise exception 'bot_pair_locked_by_active_trade';
      end if;
      v_state := coalesce(v_bot.client_state,'{}'::jsonb) || jsonb_build_object(
        'name',v_name,'pair',v_pair,'pairs',jsonb_build_array(v_pair),'allPairs',false,
        'baseOrder',v_base_order,'safetyOrder',v_safety_order,'maxSafetyOrders',v_max_safety,
        'limitSafetyOrders',v_limit_safety,'maxActiveTrades',v_max_active,'deviation',v_deviation,
        'stepScale',v_step_scale,'volumeScale',v_volume_scale,'takeProfit',v_take_profit,
        'stopEnabled',v_stop_enabled,'stopPct',v_stop_pct,'status',v_bot.status,'direction','Long',
        'averagingEnabled',true,'orderType','Market','startCondition','Immediately','coreV2Command',true
      );
      update public.trader_bots set
        name=v_name,pair=v_pair,pairs=array[v_pair],all_pairs=false,base_order=v_base_order,safety_order=v_safety_order,
        max_safety_orders=v_max_safety,limit_safety_orders=v_limit_safety,max_active_trades=v_max_active,
        deviation=v_deviation,step_scale=v_step_scale,volume_scale=v_volume_scale,take_profit_pct=v_take_profit,
        stop_enabled=v_stop_enabled,stop_pct=v_stop_pct,averaging_enabled=true,order_type='Market',client_state=v_state,
        next_scan_at=null,updated_at=v_now
      where id=v_bot.id returning * into v_bot;
    elsif v_command.command_type='automation.set_status' then
      v_status := case when v_payload->>'status'='Stopped' then 'Stopped' else 'Running' end;
      v_state := coalesce(v_bot.client_state,'{}'::jsonb) || jsonb_build_object('status',v_status,'coreV2Command',true);
      update public.trader_bots set status=v_status,client_state=v_state,next_scan_at=null,updated_at=v_now
      where id=v_bot.id returning * into v_bot;
    elsif v_command.command_type='automation.archive' then
      if exists(select 1 from public.trader_trades t where t.account_id=v_account.id and t.bot_id=v_bot.id and t.status='Active') then
        raise exception 'bot_has_active_trades';
      end if;
      if exists(select 1 from public.trader_orders o where o.account_id=v_account.id and o.bot_id=v_bot.id and o.status in ('OPEN','PENDING','NEW','PARTIALLY_FILLED')) then
        raise exception 'bot_has_open_orders';
      end if;
      v_state := coalesce(v_bot.client_state,'{}'::jsonb) || jsonb_build_object('status','Stopped','lifecycle','closed','coreV2Command',true,'closedAt',v_now);
      update public.trader_bots set status='Stopped',is_archived=true,client_state=v_state,next_scan_at=null,updated_at=v_now
      where id=v_bot.id returning * into v_bot;
    end if;
    v_result := jsonb_build_object('executed',true,'noOrderSent',true,'commandType',v_command.command_type,'botId',v_bot.id,'clientId',v_bot.client_id,'status',v_bot.status,'archived',v_bot.is_archived,'appliedAt',v_now);
  end if;

  update public.trader_v2_commands
  set status='succeeded',result=v_result,error_code=null,finished_at=v_now,
      worker_lock_id=null,worker_locked_until=null,next_attempt_at=null
  where id=v_command.id;

  insert into public.trader_v2_command_events(command_id,owner_user_id,event_type,details)
  values(v_command.id,v_command.owner_user_id,'succeeded',v_result);

  return v_result;
end;
$$;

revoke all on function public.trader_v2_enqueue_automation_command(uuid,uuid,text,text,text,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.trader_v2_claim_automation_commands(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.trader_v2_apply_automation_command(uuid,uuid) from public, anon, authenticated;
grant execute on function public.trader_v2_enqueue_automation_command(uuid,uuid,text,text,text,uuid,jsonb,jsonb) to service_role;
grant execute on function public.trader_v2_claim_automation_commands(uuid,integer,integer) to service_role;
grant execute on function public.trader_v2_apply_automation_command(uuid,uuid) to service_role;

comment on function public.trader_v2_apply_automation_command(uuid,uuid) is 'Applies Core V2 Real Account automation configuration commands only. It never sends an exchange order.';
