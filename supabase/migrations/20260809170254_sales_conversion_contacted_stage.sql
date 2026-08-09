alter table public.sales_lead_workspaces drop constraint if exists sales_lead_workspaces_stage_check;
alter table public.sales_lead_workspaces add constraint sales_lead_workspaces_stage_check check (stage in ('contacted','replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing'));

create or replace function public.sales_lead_workspace_get(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_workspace public.sales_lead_workspaces%rowtype; v_stage text;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_prospect from public.prospects where id=p_prospect_id;
  if not found then raise exception 'Prospect not found'; end if;
  if v_prospect.site_id is not null then select * into v_site from public.sites where id=v_prospect.site_id; end if;
  v_stage:=case when v_site.outreach_status in ('replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing') then v_site.outreach_status when v_prospect.status='interested' then 'interested' when v_prospect.status='replied' then 'replied' else 'contacted' end;
  insert into public.sales_lead_workspaces(prospect_id,stage,updated_by) values(p_prospect_id,v_stage,auth.uid()) on conflict(prospect_id) do nothing;
  select * into v_workspace from public.sales_lead_workspaces where prospect_id=p_prospect_id;
  return jsonb_build_object(
    'prospect',to_jsonb(v_prospect),'site',case when v_site.id is null then null else to_jsonb(v_site) end,'workspace',to_jsonb(v_workspace),
    'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc) from public.outreach_messages m where m.prospect_id=p_prospect_id and coalesce(m.is_test,false)=false),'[]'::jsonb),
    'replies',coalesce((select jsonb_agg(to_jsonb(r) order by r.received_at asc) from public.outreach_replies r where r.prospect_id=p_prospect_id),'[]'::jsonb),
    'linkedin',(select to_jsonb(l) from public.linkedin_outreach l where l.prospect_id=p_prospect_id limit 1),
    'analytics',case when v_site.id is null then null else (select to_jsonb(s) from public.sales_concept_summary s where s.site_id=v_site.id limit 1) end,
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.pipeline_events where prospect_id=p_prospect_id order by created_at desc limit 40)e),'[]'::jsonb)
  );
end; $$;

create or replace function public.sales_lead_workspace_save(p_prospect_id uuid,p_stage text,p_notes text,p_next_action text,p_next_action_due_at timestamptz,p_meeting_at timestamptz,p_meeting_location text,p_meeting_url text,p_meeting_notes text,p_proposal_status text,p_proposal_sent_at timestamptz,p_proposal_amount numeric,p_proposal_currency text,p_payment_status text,p_deposit_percent numeric,p_deposit_amount numeric,p_deposit_received_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_site_id uuid; v_before text; v_workspace public.sales_lead_workspaces%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  if p_stage not in ('contacted','replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing') then raise exception 'Invalid sales stage'; end if;
  select site_id into v_site_id from public.prospects where id=p_prospect_id; if not found then raise exception 'Prospect not found'; end if;
  select stage into v_before from public.sales_lead_workspaces where prospect_id=p_prospect_id;
  insert into public.sales_lead_workspaces(prospect_id,stage,notes,next_action,next_action_due_at,meeting_at,meeting_location,meeting_url,meeting_notes,proposal_status,proposal_sent_at,proposal_amount,proposal_currency,payment_status,deposit_percent,deposit_amount,deposit_received_at,updated_at,updated_by)
  values(p_prospect_id,p_stage,coalesce(p_notes,''),coalesce(p_next_action,''),p_next_action_due_at,p_meeting_at,coalesce(p_meeting_location,''),coalesce(p_meeting_url,''),coalesce(p_meeting_notes,''),coalesce(p_proposal_status,'not_started'),p_proposal_sent_at,p_proposal_amount,upper(coalesce(nullif(trim(p_proposal_currency),''),'USD')),coalesce(p_payment_status,'not_requested'),coalesce(p_deposit_percent,25),p_deposit_amount,p_deposit_received_at,now(),auth.uid())
  on conflict(prospect_id) do update set stage=excluded.stage,notes=excluded.notes,next_action=excluded.next_action,next_action_due_at=excluded.next_action_due_at,meeting_at=excluded.meeting_at,meeting_location=excluded.meeting_location,meeting_url=excluded.meeting_url,meeting_notes=excluded.meeting_notes,proposal_status=excluded.proposal_status,proposal_sent_at=excluded.proposal_sent_at,proposal_amount=excluded.proposal_amount,proposal_currency=excluded.proposal_currency,payment_status=excluded.payment_status,deposit_percent=excluded.deposit_percent,deposit_amount=excluded.deposit_amount,deposit_received_at=excluded.deposit_received_at,updated_at=now(),updated_by=auth.uid() returning * into v_workspace;
  if v_site_id is not null and p_stage<>'contacted' then update public.sites set outreach_status=p_stage,updated_at=now() where id=v_site_id; end if;
  if p_stage<>'contacted' then update public.prospects set status=case when p_stage='not_pursuing' then 'rejected' when p_stage='replied' then 'replied' else 'interested' end,updated_at=now() where id=p_prospect_id; end if;
  if v_before is distinct from p_stage then insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(p_prospect_id,'sales_stage_changed','sales_conversion',format('Sales stage changed from %s to %s',coalesce(v_before,'new'),p_stage),jsonb_build_object('from',v_before,'to',p_stage),auth.uid()); end if;
  return to_jsonb(v_workspace);
end; $$;
