create or replace function public.trader_v2_enqueue_exit_plan_command(
  p_owner_user_id uuid,
  p_account_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_target_id uuid,
  p_payload jsonb,
  p_validation jsonb
)
returns table(command_id uuid, command_status text, replayed boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing public.trader_v2_commands%rowtype;
  v_id uuid;
begin
  if p_owner_user_id is null or p_account_id is null or p_target_id is null then raise exception 'invalid_command_identity'; end if;
  if char_length(coalesce(p_idempotency_key,''))<8 or char_length(p_idempotency_key)>160 then raise exception 'invalid_idempotency_key'; end if;

  select * into v_existing
  from public.trader_v2_commands
  where owner_user_id=p_owner_user_id and idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_existing.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency_key_reuse'; end if;
    return query select v_existing.id,v_existing.status,true;
    return;
  end if;

  insert into public.trader_v2_commands(
    owner_user_id,account_id,idempotency_key,request_fingerprint,command_type,target_type,target_id,payload,mode,status,validation,validated_at
  ) values(
    p_owner_user_id,p_account_id,p_idempotency_key,p_request_fingerprint,'position.update_exit_plan','position',p_target_id::text,
    coalesce(p_payload,'{}'::jsonb),'execute','queued',coalesce(p_validation,'{}'::jsonb),now()
  ) returning id into v_id;

  insert into public.trader_v2_command_events(command_id,owner_user_id,event_type,details) values
    (v_id,p_owner_user_id,'received',jsonb_build_object('commandType','position.update_exit_plan','targetType','position','targetId',p_target_id,'mode','execute')),
    (v_id,p_owner_user_id,'queued',jsonb_build_object('durable',true,'noOrderSentOnQueue',true));

  return query select v_id,'queued'::text,false;
end;
$function$;

revoke all on function public.trader_v2_enqueue_exit_plan_command(uuid,uuid,text,text,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.trader_v2_enqueue_exit_plan_command(uuid,uuid,text,text,uuid,jsonb,jsonb) to service_role;
