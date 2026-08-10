create or replace function public.care_admin_request_update(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.care_requests%rowtype;
  v_has_active_care boolean;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('submitted','reviewing','scheduled','completed','declined') then raise exception 'Invalid Care request status'; end if;

  select * into v from public.care_requests where id=p_request_id for update;
  if not found then raise exception 'Care request not found'; end if;

  update public.care_requests
  set status=p_status,
      admin_notes=coalesce(p_admin_notes,admin_notes),
      completed_at=case when p_status='completed' then coalesce(completed_at,now()) else null end,
      updated_at=now(),
      updated_by=auth.uid()
  where id=v.id
  returning * into v;

  if p_status='completed' then
    select exists(
      select 1 from public.care_subscriptions s
      where s.prospect_id=v.prospect_id and s.status='active'
    ) into v_has_active_care;

    update public.sales_lead_workspaces
    set next_action=case when v_has_active_care then 'Care active' else 'Care request completed' end,
        next_action_due_at=null,
        updated_at=now()
    where prospect_id=v.prospect_id;

    insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
    values(v.prospect_id,'care_request_completed','care','LabNarrative Care update request completed',jsonb_build_object('request_id',v.id,'subject',v.subject),auth.uid());
  end if;

  return to_jsonb(v);
end;
$$;

create or replace function public.care_public_decline(
  p_token uuid,
  p_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.care_offers%rowtype;
begin
  if coalesce(length(trim(p_name)),0)<2 then return jsonb_build_object('error','Please enter your name'); end if;
  select * into v from public.care_offers where token=p_token and link_enabled=true for update;
  if not found then return jsonb_build_object('error','Care offer not found'); end if;
  if exists(select 1 from public.care_subscriptions where offer_id=v.id and status in ('active','suspended')) then
    return jsonb_build_object('error','An active Care subscription already exists');
  end if;

  update public.care_offers
  set status='declined',
      client_name=trim(p_name),
      client_email=nullif(trim(coalesce(p_email,'')),''),
      declined_at=now(),
      updated_at=now()
  where id=v.id
  returning * into v;

  update public.sales_lead_workspaces
  set next_action='Care declined',
      next_action_due_at=null,
      updated_at=now()
  where prospect_id=v.prospect_id;

  insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
  values(v.prospect_id,'care_declined','care','Client declined LabNarrative Care',jsonb_build_object('offer_id',v.id));

  return jsonb_build_object('ok',true,'status','declined');
end;
$$;
