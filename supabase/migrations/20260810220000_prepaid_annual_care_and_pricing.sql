-- Correct standard Care pricing and distinguish project-included Annual Care
-- from standalone recurring PayPal subscriptions.

update public.care_plans
set price_amount = case code
    when 'care-monthly' then 37.50
    when 'care-annual' then 300.00
    else price_amount
  end,
  paypal_plan_id = null,
  provider_status = 'needs_sync',
  provider_synced_at = null,
  provider_error = null,
  updated_at = now()
where code in ('care-monthly','care-annual');

create or replace function public.care_included_annual_proposal_id(p_prospect_id uuid)
returns uuid
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select sp.id
  from public.sales_proposals sp
  where sp.prospect_id = p_prospect_id
    and sp.status = 'accepted'
    and regexp_replace(lower(coalesce(sp.package_name,'')), '[^a-z0-9]+', '', 'g') like '%annualcare%'
  order by sp.accepted_at desc nulls last, sp.updated_at desc, sp.created_at desc
  limit 1
$$;
revoke all on function public.care_included_annual_proposal_id(uuid) from public,anon,authenticated;

create or replace function public.care_activate_included_annual(
  p_prospect_id uuid,
  p_client_name text default null,
  p_client_email text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_proposal_id uuid;
  v_launch public.sales_client_launches%rowtype;
  v_plan public.care_plans%rowtype;
  v_offer public.care_offers%rowtype;
  v_existing public.care_subscriptions%rowtype;
  v_sub public.care_subscriptions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  v_proposal_id := public.care_included_annual_proposal_id(p_prospect_id);
  if v_proposal_id is null then return null; end if;

  select * into v_launch
  from public.sales_client_launches
  where prospect_id=p_prospect_id and status='completed'
  order by created_at desc limit 1;
  if not found then raise exception 'Client handover must be completed first'; end if;

  select * into v_plan from public.care_plans where code='care-annual' and is_active=true limit 1;
  if not found then raise exception 'Annual Care plan is not available'; end if;

  perform public.care_ensure_offer(p_prospect_id);
  select * into v_offer from public.care_offers where prospect_id=p_prospect_id for update;

  v_start := coalesce(v_launch.handover_acknowledged_at,now());
  v_end := v_start + interval '1 year';

  select * into v_existing
  from public.care_subscriptions
  where offer_id=v_offer.id and status in ('approval_pending','active','suspended')
  order by created_at desc limit 1 for update;

  if v_existing.id is not null and v_existing.provider='proposal_included' then
    update public.care_subscriptions
    set status='active',
        plan_id=v_plan.id,
        plan_name='LabNarrative Care · Annual (included with project)',
        billing_interval='year',
        price_amount=v_plan.price_amount,
        currency=v_plan.currency,
        subscriber_name=coalesce(nullif(trim(coalesce(p_client_name,'')),''),subscriber_name,v_launch.handover_client_name),
        subscriber_email=coalesce(nullif(trim(coalesce(p_client_email,'')),''),subscriber_email,v_launch.handover_client_email),
        started_at=coalesce(started_at,v_start),
        next_billing_at=coalesce(next_billing_at,v_end),
        provider_metadata=provider_metadata || jsonb_build_object('included_in_proposal',true,'proposal_id',v_proposal_id,'auto_renew',false,'source','accepted_proposal','coverage_end',v_end),
        updated_at=now()
    where id=v_existing.id returning * into v_sub;
  elsif v_existing.id is not null and v_existing.provider_subscription_id is not null and v_existing.status in ('active','suspended') then
    update public.sales_lead_workspaces
    set next_action='Review Care billing conflict',next_action_due_at=now(),updated_at=now()
    where prospect_id=p_prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    select p_prospect_id,'care_included_conflict','care','Annual Care is included in the accepted proposal, but a provider Care subscription already exists',jsonb_build_object('subscription_id',v_existing.id,'proposal_id',v_proposal_id)
    where not exists(select 1 from public.pipeline_events e where e.prospect_id=p_prospect_id and e.event_type='care_included_conflict' and e.payload->>'subscription_id'=v_existing.id::text);
    return v_existing.id;
  else
    if v_existing.id is not null then
      update public.care_subscriptions
      set status='cancelled',
          cancelled_at=coalesce(cancelled_at,now()),
          provider_metadata=provider_metadata || jsonb_build_object('superseded_by_included_care',true,'proposal_id',v_proposal_id,'superseded_at',now()),
          updated_at=now()
      where id=v_existing.id;
    end if;

    insert into public.care_subscriptions(
      offer_id,prospect_id,site_id,plan_id,status,provider,provider_subscription_id,
      plan_name,billing_interval,price_amount,currency,subscriber_name,subscriber_email,
      started_at,next_billing_at,provider_metadata
    ) values (
      v_offer.id,p_prospect_id,v_offer.site_id,v_plan.id,'active','proposal_included',null,
      'LabNarrative Care · Annual (included with project)','year',v_plan.price_amount,v_plan.currency,
      coalesce(nullif(trim(coalesce(p_client_name,'')),''),v_launch.handover_client_name),
      coalesce(nullif(trim(coalesce(p_client_email,'')),''),v_launch.handover_client_email),
      v_start,v_end,
      jsonb_build_object('included_in_proposal',true,'proposal_id',v_proposal_id,'auto_renew',false,'source','accepted_proposal','coverage_end',v_end)
    ) returning * into v_sub;
  end if;

  update public.care_offers
  set status='active',selected_plan_id=v_plan.id,accepted_at=coalesce(accepted_at,v_start),
      client_name=coalesce(client_name,nullif(trim(coalesce(p_client_name,'')),''),v_launch.handover_client_name),
      client_email=coalesce(client_email,nullif(trim(coalesce(p_client_email,'')),''),v_launch.handover_client_email),
      link_enabled=true,valid_until=v_end::date,updated_at=now()
  where id=v_offer.id;

  update public.sales_lead_workspaces
  set next_action='Care active',next_action_due_at=null,updated_at=now()
  where prospect_id=p_prospect_id;

  insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
  select p_prospect_id,'care_included_activated','care','Included Annual LabNarrative Care activated from accepted proposal',jsonb_build_object('subscription_id',v_sub.id,'proposal_id',v_proposal_id,'coverage_end',v_end,'auto_renew',false)
  where not exists(select 1 from public.pipeline_events e where e.prospect_id=p_prospect_id and e.event_type='care_included_activated' and e.payload->>'proposal_id'=v_proposal_id::text);

  return v_sub.id;
end;
$$;
revoke all on function public.care_activate_included_annual(uuid,text,text) from public,anon,authenticated;

create or replace function public.care_provider_sync_subscription(p_provider_subscription_id text,p_status text,p_subscriber_name text default null,p_subscriber_email text default null,p_started_at timestamptz default null,p_next_billing_at timestamptz default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_subscriptions%rowtype; v_state text; v_superseded boolean;
begin
 select * into v from public.care_subscriptions where provider_subscription_id=p_provider_subscription_id for update;
 if not found then raise exception 'Care subscription not found'; end if;
 v_superseded:=coalesce((v.provider_metadata->>'superseded_by_included_care')::boolean,false);
 if v_superseded then
   update public.care_subscriptions
   set provider_metadata=provider_metadata||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('last_provider_status',upper(coalesce(p_status,'')),'last_provider_sync_at',now()),updated_at=now()
   where id=v.id returning * into v;
   if upper(coalesce(p_status,''))='ACTIVE' then
     update public.sales_lead_workspaces set next_action='Cancel superseded PayPal Care subscription',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
     insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
     select v.prospect_id,'care_superseded_provider_activated','care','A superseded PayPal Care subscription became active and requires cancellation',jsonb_build_object('subscription_id',v.id,'provider_subscription_id',p_provider_subscription_id)
     where not exists(select 1 from public.pipeline_events e where e.prospect_id=v.prospect_id and e.event_type='care_superseded_provider_activated' and e.payload->>'provider_subscription_id'=p_provider_subscription_id);
   end if;
   return to_jsonb(v);
 end if;
 v_state:=case upper(coalesce(p_status,'')) when 'ACTIVE' then 'active' when 'SUSPENDED' then 'suspended' when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired' when 'APPROVAL_PENDING' then 'approval_pending' else v.status end;
 update public.care_subscriptions set status=v_state,subscriber_name=coalesce(nullif(trim(coalesce(p_subscriber_name,'')),''),subscriber_name),subscriber_email=coalesce(nullif(trim(coalesce(p_subscriber_email,'')),''),subscriber_email),started_at=coalesce(started_at,p_started_at,case when v_state='active' then now() else null end),next_billing_at=coalesce(p_next_billing_at,next_billing_at),suspended_at=case when v_state='suspended' then coalesce(suspended_at,now()) else suspended_at end,cancelled_at=case when v_state='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,provider_metadata=provider_metadata||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=v.id returning * into v;
 update public.care_offers set status=case when v_state='active' then 'active' when v_state='cancelled' then 'cancelled' else status end,updated_at=now() where id=v.offer_id;
 if v_state='active' then
  update public.sales_lead_workspaces set next_action='Care active',next_action_due_at=null,updated_at=now() where prospect_id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload) select v.prospect_id,'care_activated','care','LabNarrative Care subscription activated',jsonb_build_object('subscription_id',v.id,'plan',v.plan_name,'amount',v.price_amount,'currency',v.currency,'interval',v.billing_interval) where not exists(select 1 from public.pipeline_events e where e.prospect_id=v.prospect_id and e.event_type='care_activated' and e.payload->>'subscription_id'=v.id::text);
 elsif v_state in ('suspended','cancelled') then
  update public.sales_lead_workspaces set next_action=case when v_state='suspended' then 'Resolve Care subscription payment issue' else 'Review cancelled Care subscription' end,next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
 end if;
 return to_jsonb(v);
end;
$$;

create or replace function public.sales_client_handover_public_acknowledge(p_token uuid,p_name text,p_email text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.sales_client_launches%rowtype; v_offer_id uuid; v_included_sub_id uuid;
begin
  if coalesce(length(trim(p_name)),0)<2 then return jsonb_build_object('error','Please enter your name'); end if;
  select * into v from public.sales_client_launches where handover_token=p_token and handover_link_enabled=true and status in ('launched','handover_sent','completed') for update;
  if not found then return jsonb_build_object('error','Handover link not found or disabled'); end if;
  if v.status<>'completed' then
    update public.sales_client_launches set status='completed',handover_acknowledged_at=now(),handover_client_name=trim(p_name),handover_client_email=nullif(trim(coalesce(p_email,'')),''),updated_at=now() where id=v.id returning * into v;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'handover_acknowledged','client_delivery','Client acknowledged website handover',jsonb_build_object('launch_id',v.id,'client_name',trim(p_name)));
  end if;
  if public.care_included_annual_proposal_id(v.prospect_id) is not null then
    v_included_sub_id:=public.care_activate_included_annual(v.prospect_id,trim(p_name),nullif(trim(coalesce(p_email,'')),''));
    return jsonb_build_object('ok',true,'status','completed','acknowledged_at',v.handover_acknowledged_at,'care_offer_ready',false,'care_included',true,'care_subscription_id',v_included_sub_id);
  end if;
  v_offer_id:=public.care_ensure_offer(v.prospect_id);
  update public.care_offers set client_name=coalesce(client_name,trim(p_name)),client_email=coalesce(client_email,nullif(trim(coalesce(p_email,'')),'')),updated_at=now() where id=v_offer_id;
  update public.sales_lead_workspaces set next_action='Send LabNarrative Care offer',next_action_due_at=now()+interval '7 days',updated_at=now() where prospect_id=v.prospect_id;
  return jsonb_build_object('ok',true,'status','completed','acknowledged_at',v.handover_acknowledged_at,'care_offer_ready',true,'care_included',false);
end;
$$;
revoke all on function public.sales_client_handover_public_acknowledge(uuid,text,text) from public;
grant execute on function public.sales_client_handover_public_acknowledge(uuid,text,text) to anon,authenticated;

create or replace function public.care_admin_get(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.care_offers%rowtype; v_launch public.sales_client_launches%rowtype; v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_sub public.care_subscriptions%rowtype;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select * into v_prospect from public.prospects where id=p_prospect_id; if not found then raise exception 'Prospect not found'; end if;
 if v_prospect.site_id is not null then select * into v_site from public.sites where id=v_prospect.site_id; end if;
 select * into v_launch from public.sales_client_launches where prospect_id=p_prospect_id order by created_at desc limit 1;
 if v_launch.status='completed' then
   if public.care_included_annual_proposal_id(p_prospect_id) is not null then perform public.care_activate_included_annual(p_prospect_id,v_launch.handover_client_name,v_launch.handover_client_email); else perform public.care_ensure_offer(p_prospect_id); end if;
 end if;
 select * into v_offer from public.care_offers where prospect_id=p_prospect_id;
 if v_offer.id is not null then select * into v_sub from public.care_subscriptions where offer_id=v_offer.id order by created_at desc limit 1; end if;
 return jsonb_build_object('prospect',to_jsonb(v_prospect),'site',case when v_site.id is null then null else to_jsonb(v_site) end,'launch',case when v_launch.id is null then null else to_jsonb(v_launch) end,'offer',case when v_offer.id is null then null else to_jsonb(v_offer) end,'subscription',case when v_sub.id is null then null else to_jsonb(v_sub) end,'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order) from public.care_plans p where p.is_active),'[]'::jsonb),'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.submitted_at desc) from public.care_requests r where r.prospect_id=p_prospect_id),'[]'::jsonb));
end;
$$;

create or replace function public.care_public_get(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.care_offers%rowtype; v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_sub public.care_subscriptions%rowtype;
begin
 select * into v_offer from public.care_offers where token=p_token and link_enabled=true for update;
 if not found then return jsonb_build_object('error','Care portal not found or link disabled'); end if;
 if v_offer.valid_until<current_date and v_offer.status not in ('active','accepted') and not exists(select 1 from public.care_subscriptions where offer_id=v_offer.id and status in ('active','suspended')) then return jsonb_build_object('error','This Care offer has expired'); end if;
 update public.care_offers set status=case when status in ('ready','shared') then 'viewed' else status end,first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v_offer.id returning * into v_offer;
 select * into v_prospect from public.prospects where id=v_offer.prospect_id;
 if v_offer.site_id is not null then select * into v_site from public.sites where id=v_offer.site_id; end if;
 select * into v_sub from public.care_subscriptions where offer_id=v_offer.id order by created_at desc limit 1;
 return jsonb_build_object(
  'offer',jsonb_build_object('id',v_offer.id,'status',v_offer.status,'valid_until',v_offer.valid_until,'selected_plan_id',v_offer.selected_plan_id,'client_name',v_offer.client_name,'client_email',v_offer.client_email),
  'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),
  'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'status',v_site.status,'lab_name',v_site.content->>'labName') end,
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'billing_interval',p.billing_interval,'price_amount',p.price_amount,'currency',p.currency,'features',p.features,'provider_ready',(p.paypal_plan_id is not null and p.provider_status='synced')) order by p.display_order) from public.care_plans p where p.is_active),'[]'::jsonb),
  'subscription',case when v_sub.id is null then null else jsonb_build_object('id',v_sub.id,'status',v_sub.status,'provider',v_sub.provider,'included_in_proposal',(v_sub.provider='proposal_included'),'plan_name',v_sub.plan_name,'billing_interval',v_sub.billing_interval,'price_amount',v_sub.price_amount,'currency',v_sub.currency,'subscriber_name',v_sub.subscriber_name,'subscriber_email',v_sub.subscriber_email,'started_at',v_sub.started_at,'next_billing_at',v_sub.next_billing_at,'coverage_end',case when v_sub.provider='proposal_included' then v_sub.next_billing_at else null end,'last_payment_at',v_sub.last_payment_at) end,
  'requests',case when v_sub.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'category',r.category,'subject',r.subject,'details',r.details,'status',r.status,'submitted_at',r.submitted_at,'completed_at',r.completed_at) order by r.submitted_at desc) from public.care_requests r where r.subscription_id=v_sub.id),'[]'::jsonb) end
 );
end;
$$;
revoke all on function public.care_public_get(uuid) from public;
grant execute on function public.care_public_get(uuid) to anon,authenticated;

create or replace function public.sales_client_handover_public_get(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.sales_client_launches%rowtype; v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_onboarding public.sales_client_onboarding%rowtype; v_payment public.sales_payment_requests%rowtype; v_offer public.care_offers%rowtype; v_sub public.care_subscriptions%rowtype; v_url text;
begin
 select * into v from public.sales_client_launches where handover_token=p_token and handover_link_enabled=true and status in ('launched','handover_sent','completed') for update;
 if not found then return jsonb_build_object('error','Handover link not found or disabled'); end if;
 if v.status<>'completed' then update public.sales_client_launches set handover_first_viewed_at=coalesce(handover_first_viewed_at,now()),handover_last_viewed_at=now(),handover_view_count=handover_view_count+1,updated_at=now() where id=v.id returning * into v; end if;
 select * into v_prospect from public.prospects where id=v.prospect_id; select * into v_site from public.sites where id=v.site_id; select * into v_onboarding from public.sales_client_onboarding where id=v.onboarding_id; select * into v_payment from public.sales_payment_requests where id=v.balance_payment_id;
 if v.status='completed' then select * into v_offer from public.care_offers where prospect_id=v.prospect_id; if v_offer.id is not null then select * into v_sub from public.care_subscriptions where offer_id=v_offer.id order by created_at desc limit 1; end if; end if;
 v_url:=coalesce(nullif(v_site.domain_url,''),'https://'||v_site.slug||'.labnarrative.com');
 return jsonb_build_object('handover',jsonb_build_object('status',v.status,'launched_at',v.launched_at,'handover_sent_at',v.handover_sent_at,'acknowledged_at',v.handover_acknowledged_at,'client_name',v.handover_client_name),'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),'site',jsonb_build_object('slug',v_site.slug,'url',v_url,'domain_status',v_site.domain_status),'domain',jsonb_build_object('choice',v_onboarding.domain_choice,'preferred_domain',v_onboarding.preferred_domain),'payment',jsonb_build_object('status',v_payment.status,'amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at),'care',case when v_offer.id is null then null else jsonb_build_object('token',v_offer.token,'status',v_offer.status,'valid_until',v_offer.valid_until,'included',(v_sub.id is not null and v_sub.provider='proposal_included'),'coverage_end',case when v_sub.provider='proposal_included' then v_sub.next_billing_at else null end) end,'support',jsonb_build_object('email','khaled@labnarrative.com','provider','LabNarrative'));
end;
$$;
revoke all on function public.sales_client_handover_public_get(uuid) from public;
grant execute on function public.sales_client_handover_public_get(uuid) to anon,authenticated;

create or replace function public.care_admin_dashboard()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select jsonb_build_object(
  'provider',(select to_jsonb(s) from public.care_provider_state s where singleton=true),
  'counts',jsonb_build_object('active',(select count(*) from public.care_subscriptions where status='active'),'approvalPending',(select count(*) from public.care_subscriptions where status='approval_pending'),'suspended',(select count(*) from public.care_subscriptions where status='suspended'),'openRequests',(select count(*) from public.care_requests where status in ('submitted','reviewing','scheduled')),'offers',(select count(*) from public.care_offers where status in ('ready','shared','viewed','accepted'))),
  'mrr',coalesce((select round(sum(case when billing_interval='month' then price_amount else price_amount/12 end),2) from public.care_subscriptions where status='active' and provider<>'proposal_included'),0),
  'arr',coalesce((select round(sum(case when billing_interval='year' then price_amount else price_amount*12 end),2) from public.care_subscriptions where status='active' and provider<>'proposal_included'),0),
  'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order,p.created_at) from public.care_plans p),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'prospectId',s.prospect_id,'siteId',s.site_id,'status',s.status,'provider',s.provider,'included',s.provider='proposal_included','planName',s.plan_name,'billingInterval',s.billing_interval,'priceAmount',s.price_amount,'currency',s.currency,'subscriberName',s.subscriber_name,'subscriberEmail',s.subscriber_email,'startedAt',s.started_at,'nextBillingAt',s.next_billing_at,'lastPaymentAt',s.last_payment_at,'piName',p.pi_name,'institution',p.institution,'slug',st.slug) order by s.updated_at desc) from public.care_subscriptions s join public.prospects p on p.id=s.prospect_id left join public.sites st on st.id=s.site_id),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'prospectId',r.prospect_id,'status',r.status,'category',r.category,'subject',r.subject,'details',r.details,'clientName',r.client_name,'clientEmail',r.client_email,'submittedAt',r.submitted_at,'completedAt',r.completed_at,'piName',p.pi_name,'institution',p.institution) order by case r.status when 'submitted' then 0 when 'reviewing' then 1 when 'scheduled' then 2 else 3 end,r.submitted_at desc) from public.care_requests r join public.prospects p on p.id=r.prospect_id),'[]'::jsonb)
 ) into v; return v;
end;
$$;

-- Backfill already-completed handovers whose accepted package includes Annual Care.
do $$
declare r record;
begin
 for r in select distinct l.prospect_id,l.handover_client_name,l.handover_client_email from public.sales_client_launches l where l.status='completed' and public.care_included_annual_proposal_id(l.prospect_id) is not null
 loop perform public.care_activate_included_annual(r.prospect_id,r.handover_client_name,r.handover_client_email); end loop;
end;
$$;
