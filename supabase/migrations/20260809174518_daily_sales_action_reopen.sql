create or replace function public.sales_daily_action_complete(p_action_key text,p_prospect_id uuid,p_action_type text,p_title text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  if p_action_key is null or length(trim(p_action_key))<3 then raise exception 'Invalid action key'; end if;
  if not exists(select 1 from public.prospects where id=p_prospect_id) then raise exception 'Prospect not found'; end if;

  insert into public.sales_action_completions(action_key,prospect_id,action_type,title,completed_at,completed_by)
  values(p_action_key,p_prospect_id,coalesce(nullif(trim(p_action_type),''),'manual'),left(coalesce(nullif(trim(p_title),''),'Sales action'),240),now(),auth.uid())
  on conflict(action_key) do update set completed_at=excluded.completed_at,completed_by=excluded.completed_by;

  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(p_prospect_id,'sales_action_completed','sales_daily_queue',left(coalesce(nullif(trim(p_title),''),'Sales action completed'),500),jsonb_build_object('action_key',p_action_key,'action_type',p_action_type),auth.uid());

  return jsonb_build_object('ok',true,'action_key',p_action_key,'completed_at',now());
end;
$function$;

create or replace function public.sales_daily_action_reopen(p_action_key text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_row public.sales_action_completions%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  delete from public.sales_action_completions where action_key=p_action_key returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok',true,'reopened',false); end if;

  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(v_row.prospect_id,'sales_action_reopened','sales_daily_queue','Sales action reopened',jsonb_build_object('action_key',p_action_key,'action_type',v_row.action_type),auth.uid());
  return jsonb_build_object('ok',true,'reopened',true,'action_key',p_action_key);
end;
$function$;

revoke all on function public.sales_daily_action_reopen(text) from public,anon;
grant execute on function public.sales_daily_action_reopen(text) to authenticated,service_role;
