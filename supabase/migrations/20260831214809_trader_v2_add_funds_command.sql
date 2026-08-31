insert into public.trader_v2_command_gates(command_type,account_id,enabled,note,updated_at)
select 'position.add_funds',a.id,false,'Core V2 add-funds execution staged; keep disabled until worker and V1 UI deployment are verified',now()
from public.trader_accounts a
where a.account_kind='real' and a.status='active'
on conflict (command_type,account_id) do update
set enabled=false,note=excluded.note,updated_at=now();

create or replace function public.trader_v2_enqueue_add_funds_command(
  p_owner_user_id uuid,p_account_id uuid,p_idempotency_key text,p_request_fingerprint text,
  p_target_id uuid,p_quote_amount numeric,p_validation jsonb
)
returns table(command_id uuid,command_status text,replayed boolean)
language plpgsql security definer set search_path=public as $$
declare v_existing public.trader_v2_commands%rowtype; v_id uuid;
begin
  if p_owner_user_id is null or p_account_id is null or p_target_id is null then raise exception 'invalid_command_identity'; end if;
  if char_length(coalesce(p_idempotency_key,''))<8 or char_length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key'; end if;
  if not (coalesce(p_quote_amount,0)>0 and p_quote_amount<=1000000) then raise exception 'invalid_add_funds_amount'; end if;
  if not exists(select 1 from public.trader_v2_command_gates g where g.account_id=p_account_id and g.command_type='position.add_funds' and g.enabled=true) then raise exception 'core_v2_execute_disabled'; end if;
  select * into v_existing from public.trader_v2_commands where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency_key_reuse'; end if;
    return query select v_existing.id,v_existing.status,true; return;
  end if;
  insert into public.trader_v2_commands(owner_user_id,account_id,idempotency_key,request_fingerprint,command_type,target_type,target_id,payload,mode,status,validation,validated_at)
  values(p_owner_user_id,p_account_id,p_idempotency_key,p_request_fingerprint,'position.add_funds','position',p_target_id::text,jsonb_build_object('quoteAmount',p_quote_amount),'execute','queued',coalesce(p_validation,'{}'::jsonb),now()) returning id into v_id;
  insert into public.trader_v2_command_events(command_id,owner_user_id,event_type,details) values
    (v_id,p_owner_user_id,'received',jsonb_build_object('commandType','position.add_funds','targetType','position','targetId',p_target_id,'mode','execute')),
    (v_id,p_owner_user_id,'queued',jsonb_build_object('durable',true,'idempotent',true,'sendsMarketOrder',true));
  return query select v_id,'queued'::text,false;
end; $$;

create or replace function public.trader_v2_claim_add_funds_commands(p_worker_id uuid,p_limit integer default 4,p_lease_seconds integer default 45)
returns setof public.trader_v2_commands language plpgsql security definer set search_path=public as $$
begin
  if p_worker_id is null then raise exception 'worker_id_required'; end if;
  return query
  with candidates as (
    select c.id from public.trader_v2_commands c
    where c.mode='execute' and c.command_type='position.add_funds'
      and ((c.status='queued' and (c.next_attempt_at is null or c.next_attempt_at<=now())) or (c.status='running' and (c.worker_locked_until is null or c.worker_locked_until<now())))
    order by c.requested_at asc for update skip locked limit greatest(1,least(8,coalesce(p_limit,4)))
  )
  update public.trader_v2_commands c
  set status='running',worker_lock_id=p_worker_id,worker_locked_until=now()+make_interval(secs=>greatest(15,least(120,coalesce(p_lease_seconds,45)))),
      attempt_count=c.attempt_count+1,started_at=coalesce(c.started_at,now()),next_attempt_at=null,error_code=null
  from candidates x where c.id=x.id returning c.*;
end; $$;

create or replace function public.trader_v2_apply_add_funds_fill(
  p_command_id uuid,p_worker_id uuid,p_order_id uuid,p_exchange_order_id text,p_remote_status text,
  p_fill_price numeric,p_net_quantity numeric,p_cost_quote numeric,p_raw_fills jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_command public.trader_v2_commands%rowtype; v_trade public.trader_trades%rowtype; v_order public.trader_orders%rowtype;
  v_provider text; v_now timestamptz:=now(); v_new_qty numeric; v_new_invested numeric; v_result jsonb; v_fill jsonb; v_fill_count integer:=0;
begin
  select * into v_command from public.trader_v2_commands where id=p_command_id and mode='execute' and command_type='position.add_funds' and status='running' and worker_lock_id=p_worker_id for update;
  if not found then raise exception 'command_not_running'; end if;
  if v_command.target_type<>'position' or coalesce(v_command.target_id,'')='' then raise exception 'invalid_command_target'; end if;
  if not exists(select 1 from public.trader_accounts a where a.id=v_command.account_id and a.worker_lock_id=p_worker_id and a.worker_locked_until>now()) then raise exception 'account_lock_required'; end if;
  select * into v_trade from public.trader_trades where id=v_command.target_id::uuid and account_id=v_command.account_id for update;
  if not found then raise exception 'position_not_found'; end if;
  if v_trade.status<>'Active' then raise exception 'position_not_active'; end if;
  if v_trade.execution_mode<>'live' then raise exception 'position_not_live'; end if;
  select * into v_order from public.trader_orders where id=p_order_id and account_id=v_command.account_id and trade_id=v_trade.id for update;
  if not found then raise exception 'add_funds_order_not_found'; end if;
  if v_order.kind<>'add_funds' or upper(v_order.side)<>'BUY' then raise exception 'invalid_add_funds_order'; end if;
  if not (coalesce(p_fill_price,0)>0 and coalesce(p_net_quantity,0)>0 and coalesce(p_cost_quote,0)>0) then raise exception 'add_funds_fill_invalid'; end if;
  v_provider:=lower(coalesce(nullif(v_trade.exchange_provider,''),nullif(v_trade.client_state->>'exchangeProvider',''),nullif(v_trade.client_state->>'exchange',''),'binance'));
  v_new_qty:=v_trade.quantity+p_net_quantity; v_new_invested:=v_trade.invested+p_cost_quote;
  update public.trader_orders set status='FILLED',reserved_quote=0,filled_qty=p_net_quantity,filled_quote=p_cost_quote,average_fill_price=p_fill_price,
    exchange=v_provider,exchange_order_id=nullif(p_exchange_order_id,''),filled_at=v_now,updated_at=v_now,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('exchange',v_provider,'remote_status',coalesce(p_remote_status,'FILLED'),'coreV2Command',true,'commandId',v_command.id)
  where id=v_order.id;
  if jsonb_typeof(coalesce(p_raw_fills,'[]'::jsonb))='array' and jsonb_array_length(coalesce(p_raw_fills,'[]'::jsonb))>0 then
    for v_fill in select value from jsonb_array_elements(p_raw_fills) loop
      if coalesce((v_fill->>'quantity')::numeric,0)>0 and coalesce((v_fill->>'price')::numeric,0)>0 then
        insert into public.trader_fills(account_id,bot_id,trade_id,order_id,pair,side,kind,price,quantity,quote_amount,fee_asset,fee_amount,exchange_trade_id,filled_at,metadata)
        values(v_command.account_id,v_trade.bot_id,v_trade.id,v_order.id,v_trade.pair,'BUY','Add Funds',(v_fill->>'price')::numeric,(v_fill->>'quantity')::numeric,
          coalesce((v_fill->>'quoteAmount')::numeric,(v_fill->>'price')::numeric*(v_fill->>'quantity')::numeric),nullif(v_fill->>'feeAsset',''),coalesce((v_fill->>'feeAmount')::numeric,0),
          nullif(v_fill->>'tradeId',''),v_now,jsonb_build_object('exchange',v_provider,'coreV2Command',true,'commandId',v_command.id));
        v_fill_count:=v_fill_count+1;
      end if;
    end loop;
  end if;
  if v_fill_count=0 then
    insert into public.trader_fills(account_id,bot_id,trade_id,order_id,pair,side,kind,price,quantity,quote_amount,fee_amount,filled_at,metadata)
    values(v_command.account_id,v_trade.bot_id,v_trade.id,v_order.id,v_trade.pair,'BUY','Add Funds',p_fill_price,p_net_quantity,p_cost_quote,0,v_now,
      jsonb_build_object('exchange',v_provider,'coreV2Command',true,'commandId',v_command.id,'syntheticAggregate',true));
  end if;
  update public.trader_trades set quantity=v_new_qty,invested=v_new_invested,average_price=case when v_new_qty>0 then v_new_invested/v_new_qty else average_price end,
    last_price=p_fill_price,client_state=coalesce(client_state,'{}'::jsonb)||jsonb_build_object('exchange',v_provider,'exchangeProvider',v_provider,'lastAddFundsAt',v_now,'lastAddFundsCommandId',v_command.id)
  where id=v_trade.id;
  v_result:=jsonb_build_object('executed',true,'commandType','position.add_funds','positionId',v_trade.id,'clientId',v_trade.client_id,'pair',v_trade.pair,'provider',v_provider,
    'quoteAmount',p_cost_quote,'netQuantity',p_net_quantity,'fillPrice',p_fill_price,'exchangeOrderId',nullif(p_exchange_order_id,''),'appliedAt',v_now);
  insert into public.trader_broker_events(account_id,bot_id,trade_id,order_id,mode,event_type,pair,client_order_id,exchange_order_id,payload)
  values(v_command.account_id,v_trade.bot_id,v_trade.id,v_order.id,'live','manual_add_funds_filled_v2_command',v_trade.pair,v_order.client_order_id,nullif(p_exchange_order_id,''),v_result||jsonb_build_object('commandId',v_command.id,'coreV2Command',true));
  update public.trader_v2_commands set status='succeeded',result=v_result,error_code=null,finished_at=v_now,worker_lock_id=null,worker_locked_until=null,next_attempt_at=null where id=v_command.id;
  insert into public.trader_v2_command_events(command_id,owner_user_id,event_type,details) values(v_command.id,v_command.owner_user_id,'succeeded',v_result);
  return v_result;
end; $$;

revoke all on function public.trader_v2_enqueue_add_funds_command(uuid,uuid,text,text,uuid,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.trader_v2_claim_add_funds_commands(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.trader_v2_apply_add_funds_fill(uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.trader_v2_enqueue_add_funds_command(uuid,uuid,text,text,uuid,numeric,jsonb) to service_role;
grant execute on function public.trader_v2_claim_add_funds_commands(uuid,integer,integer) to service_role;
grant execute on function public.trader_v2_apply_add_funds_fill(uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb) to service_role;
