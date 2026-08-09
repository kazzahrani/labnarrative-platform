drop function if exists public.sales_payment_provider_bind(uuid,text,jsonb);
create function public.sales_payment_provider_bind(p_payment_id uuid,p_order_id text,p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_payment_requests%rowtype;
begin
  if coalesce(length(trim(p_order_id)),0)=0 then raise exception 'Provider order ID is required'; end if;
  select * into v from public.sales_payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v.status in ('paid','refunded','cancelled','expired') then raise exception 'Payment request is closed'; end if;
  if v.provider_order_id is not null and v.provider_order_id <> trim(p_order_id) then raise exception 'A different provider order is already bound'; end if;
  update public.sales_payment_requests set provider_order_id=trim(p_order_id),status='processing',processing_at=coalesce(processing_at,now()),
    provider_metadata=provider_metadata || coalesce(p_metadata,'{}'::jsonb),failure_message=null,failed_at=null,updated_at=now()
  where id=p_payment_id returning * into v;
  return to_jsonb(v);
end;
$$;

drop function if exists public.sales_payment_provider_fail(uuid,text,jsonb);
create function public.sales_payment_provider_fail(p_payment_id uuid,p_message text,p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_payment_requests%rowtype;
begin
  select * into v from public.sales_payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then return to_jsonb(v); end if;
  if v.status not in ('cancelled','expired','refunded') then
    update public.sales_payment_requests set status='failed',failed_at=now(),failure_message=left(coalesce(p_message,'Payment provider error'),1500),
      provider_metadata=provider_metadata || coalesce(p_metadata,'{}'::jsonb),updated_at=now()
    where id=p_payment_id returning * into v;
  end if;
  return to_jsonb(v);
end;
$$;

drop function if exists public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb);
create function public.sales_payment_provider_complete(
  p_payment_id uuid,
  p_order_id text,
  p_capture_id text,
  p_capture_status text,
  p_capture_amount numeric,
  p_capture_currency text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_payment_requests%rowtype;
  v_site_id uuid;
  v_payer_name text;
  v_payer_email text;
begin
  select * into v from public.sales_payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then return to_jsonb(v); end if;
  if v.status in ('cancelled','expired','refunded') then raise exception 'Payment request is closed'; end if;
  if coalesce(v.provider_order_id,'') <> coalesce(trim(p_order_id),'') then raise exception 'Provider order does not match this payment request'; end if;
  if upper(coalesce(trim(p_capture_status),'')) <> 'COMPLETED' then raise exception 'Provider capture is not completed'; end if;
  if p_capture_amount is null or round(p_capture_amount,2) <> round(v.amount,2) then raise exception 'Captured amount does not match the requested amount'; end if;
  if upper(coalesce(trim(p_capture_currency),'')) <> upper(v.currency) then raise exception 'Captured currency does not match the requested currency'; end if;
  if coalesce(length(trim(p_capture_id)),0)=0 then raise exception 'Provider capture ID is required'; end if;

  v_payer_name := nullif(trim(coalesce(p_metadata#>>'{payer,name}','')),'');
  v_payer_email := nullif(trim(coalesce(p_metadata#>>'{payer,email}','')),'');

  update public.sales_payment_requests set status='paid',provider_capture_id=trim(p_capture_id),paid_at=now(),
    payer_name=coalesce(v_payer_name,payer_name),payer_email=coalesce(v_payer_email,payer_email),
    provider_metadata=provider_metadata || coalesce(p_metadata,'{}'::jsonb),failure_message=null,failed_at=null,updated_at=now()
  where id=v.id returning * into v;

  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  update public.sales_lead_workspaces set stage='client',payment_status='deposit_received',deposit_amount=v.amount,deposit_percent=v.deposit_percent,
    deposit_received_at=now(),next_action='Begin client onboarding',next_action_due_at=now(),updated_at=now()
  where prospect_id=v.prospect_id;
  if v_site_id is not null then update public.sites set outreach_status='client',updated_at=now() where id=v_site_id; end if;
  update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
  values(v.prospect_id,'deposit_received','sales_conversion','Deposit payment captured successfully',
    jsonb_build_object('payment_id',v.id,'proposal_id',v.proposal_id,'amount',v.amount,'currency',v.currency,'provider',v.provider,'provider_order_id',p_order_id,'provider_capture_id',p_capture_id));
  return to_jsonb(v);
end;
$$;

revoke all on function public.sales_payment_provider_bind(uuid,text,jsonb) from public;
revoke all on function public.sales_payment_provider_fail(uuid,text,jsonb) from public;
revoke all on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) from public;
grant execute on function public.sales_payment_provider_bind(uuid,text,jsonb) to service_role;
grant execute on function public.sales_payment_provider_fail(uuid,text,jsonb) to service_role;
grant execute on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) to service_role;
