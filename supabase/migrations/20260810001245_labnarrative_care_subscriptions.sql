create table public.care_provider_state (
  singleton boolean primary key default true check (singleton),
  provider text not null default 'paypal',
  environment text not null default 'live' check (environment in ('live','sandbox')),
  paypal_product_id text,
  paypal_webhook_id text,
  webhook_status text not null default 'pending' check (webhook_status in ('pending','ready','error')),
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.care_provider_state(singleton) values(true) on conflict(singleton) do nothing;

create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  billing_interval text not null check (billing_interval in ('month','year')),
  price_amount numeric(12,2) not null check (price_amount > 0),
  currency text not null default 'USD',
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  paypal_plan_id text,
  provider_status text not null default 'needs_sync' check (provider_status in ('needs_sync','synced','error')),
  provider_synced_at timestamptz,
  provider_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.care_plans(code,name,description,billing_interval,price_amount,currency,features,is_active,display_order)
values
('care-monthly','LabNarrative Care · Monthly','Ongoing website hosting, monitoring, support and routine scientific content updates.','month',29,'USD','["Managed hosting and HTTPS/domain monitoring","Website availability and health monitoring","Routine publication, team and opportunities updates","Routine text and image updates","Email support for website changes"]'::jsonb,true,10),
('care-annual','LabNarrative Care · Annual','A full year of ongoing website hosting, monitoring, support and routine scientific content updates.','year',290,'USD','["Managed hosting and HTTPS/domain monitoring","Website availability and health monitoring","Routine publication, team and opportunities updates","Routine text and image updates","Email support for website changes"]'::jsonb,true,20)
on conflict(code) do nothing;

create table public.care_offers (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references public.prospects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  launch_id uuid references public.sales_client_launches(id) on delete set null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'ready' check (status in ('ready','shared','viewed','accepted','declined','active','cancelled')),
  link_enabled boolean not null default true,
  valid_until date not null default (current_date + 30),
  selected_plan_id uuid references public.care_plans(id) on delete set null,
  client_name text,
  client_email text,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  shared_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.care_subscriptions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.care_offers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  plan_id uuid not null references public.care_plans(id),
  status text not null default 'approval_pending' check (status in ('approval_pending','active','suspended','cancelled','expired','failed')),
  provider text not null default 'paypal',
  provider_subscription_id text unique,
  plan_name text not null,
  billing_interval text not null check (billing_interval in ('month','year')),
  price_amount numeric(12,2) not null check (price_amount > 0),
  currency text not null,
  subscriber_name text,
  subscriber_email text,
  started_at timestamptz,
  next_billing_at timestamptz,
  last_payment_at timestamptz,
  last_payment_amount numeric(12,2),
  suspended_at timestamptz,
  cancelled_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index care_one_open_subscription_per_offer on public.care_subscriptions(offer_id) where status in ('approval_pending','active','suspended');
create index care_subscriptions_status_idx on public.care_subscriptions(status,updated_at desc);

create table public.care_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.care_subscriptions(id) on delete cascade,
  provider_payment_id text not null unique,
  status text not null default 'completed' check (status in ('completed','refunded','reversed')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null,
  paid_at timestamptz not null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.care_requests (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.care_subscriptions(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  category text not null check (category in ('publication','team','opportunity','text','image','domain','other')),
  subject text not null,
  details text not null,
  status text not null default 'submitted' check (status in ('submitted','reviewing','scheduled','completed','declined')),
  client_name text,
  client_email text,
  admin_notes text,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index care_requests_status_idx on public.care_requests(status,submitted_at desc);

alter table public.care_provider_state enable row level security;
alter table public.care_plans enable row level security;
alter table public.care_offers enable row level security;
alter table public.care_subscriptions enable row level security;
alter table public.care_subscription_payments enable row level security;
alter table public.care_requests enable row level security;
revoke all on public.care_provider_state, public.care_plans, public.care_offers, public.care_subscriptions, public.care_subscription_payments, public.care_requests from anon,authenticated;

create or replace function public.care_ensure_offer(p_prospect_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_launch public.sales_client_launches%rowtype; v_site uuid; v_id uuid;
begin
  select * into v_launch from public.sales_client_launches where prospect_id=p_prospect_id and status='completed' order by created_at desc limit 1;
  if not found then raise exception 'Client handover must be completed first'; end if;
  select site_id into v_site from public.prospects where id=p_prospect_id;
  insert into public.care_offers(prospect_id,site_id,launch_id,status,created_by)
  values(p_prospect_id,coalesce(v_launch.site_id,v_site),v_launch.id,'ready',auth.uid())
  on conflict(prospect_id) do update set launch_id=excluded.launch_id,site_id=coalesce(public.care_offers.site_id,excluded.site_id),updated_at=now()
  returning id into v_id;
  return v_id;
end;$$;

create or replace function public.care_admin_dashboard()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select jsonb_build_object(
  'provider',(select to_jsonb(s) from public.care_provider_state s where singleton=true),
  'counts',jsonb_build_object(
   'active',(select count(*) from public.care_subscriptions where status='active'),
   'approvalPending',(select count(*) from public.care_subscriptions where status='approval_pending'),
   'suspended',(select count(*) from public.care_subscriptions where status='suspended'),
   'openRequests',(select count(*) from public.care_requests where status in ('submitted','reviewing','scheduled')),
   'offers',(select count(*) from public.care_offers where status in ('ready','shared','viewed','accepted'))
  ),
  'mrr',coalesce((select round(sum(case when billing_interval='month' then price_amount else price_amount/12 end),2) from public.care_subscriptions where status='active'),0),
  'arr',coalesce((select round(sum(case when billing_interval='year' then price_amount else price_amount*12 end),2) from public.care_subscriptions where status='active'),0),
  'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order,p.created_at) from public.care_plans p),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'prospectId',s.prospect_id,'siteId',s.site_id,'status',s.status,'planName',s.plan_name,'billingInterval',s.billing_interval,'priceAmount',s.price_amount,'currency',s.currency,'subscriberName',s.subscriber_name,'subscriberEmail',s.subscriber_email,'startedAt',s.started_at,'nextBillingAt',s.next_billing_at,'lastPaymentAt',s.last_payment_at,'piName',p.pi_name,'institution',p.institution,'slug',st.slug) order by s.updated_at desc) from public.care_subscriptions s join public.prospects p on p.id=s.prospect_id left join public.sites st on st.id=s.site_id),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'prospectId',r.prospect_id,'status',r.status,'category',r.category,'subject',r.subject,'details',r.details,'clientName',r.client_name,'clientEmail',r.client_email,'submittedAt',r.submitted_at,'completedAt',r.completed_at,'piName',p.pi_name,'institution',p.institution) order by case r.status when 'submitted' then 0 when 'reviewing' then 1 when 'scheduled' then 2 else 3 end,r.submitted_at desc) from public.care_requests r join public.prospects p on p.id=r.prospect_id),'[]'::jsonb)
 ) into v;
 return v;
end;$$;

create or replace function public.care_admin_plan_save(p_plan_id uuid,p_name text,p_description text,p_price_amount numeric,p_currency text,p_features jsonb,p_is_active boolean,p_display_order integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_plans%rowtype; v_changed boolean;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select * into v from public.care_plans where id=p_plan_id for update; if not found then raise exception 'Care plan not found'; end if;
 v_changed:=round(v.price_amount,2)<>round(p_price_amount,2) or upper(v.currency)<>upper(trim(p_currency)) or v.name<>trim(p_name);
 update public.care_plans set name=trim(p_name),description=coalesce(p_description,''),price_amount=round(p_price_amount,2),currency=upper(trim(p_currency)),features=coalesce(p_features,'[]'::jsonb),is_active=coalesce(p_is_active,false),display_order=coalesce(p_display_order,0),updated_at=now(),updated_by=auth.uid(),
  paypal_plan_id=case when v_changed then null else paypal_plan_id end,
  provider_status=case when v_changed then 'needs_sync' else provider_status end,
  provider_synced_at=case when v_changed then null else provider_synced_at end,
  provider_error=null
 where id=p_plan_id returning * into v;
 return to_jsonb(v);
end;$$;

create or replace function public.care_admin_get(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.care_offers%rowtype; v_launch public.sales_client_launches%rowtype; v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_sub public.care_subscriptions%rowtype;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select * into v_prospect from public.prospects where id=p_prospect_id; if not found then raise exception 'Prospect not found'; end if;
 if v_prospect.site_id is not null then select * into v_site from public.sites where id=v_prospect.site_id; end if;
 select * into v_launch from public.sales_client_launches where prospect_id=p_prospect_id order by created_at desc limit 1;
 if v_launch.status='completed' then perform public.care_ensure_offer(p_prospect_id); end if;
 select * into v_offer from public.care_offers where prospect_id=p_prospect_id;
 if v_offer.id is not null then select * into v_sub from public.care_subscriptions where offer_id=v_offer.id order by created_at desc limit 1; end if;
 return jsonb_build_object('prospect',to_jsonb(v_prospect),'site',case when v_site.id is null then null else to_jsonb(v_site) end,'launch',case when v_launch.id is null then null else to_jsonb(v_launch) end,'offer',case when v_offer.id is null then null else to_jsonb(v_offer) end,'subscription',case when v_sub.id is null then null else to_jsonb(v_sub) end,'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order) from public.care_plans p where p.is_active),'[]'::jsonb),'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.submitted_at desc) from public.care_requests r where r.prospect_id=p_prospect_id),'[]'::jsonb));
end;$$;

create or replace function public.care_admin_mark_shared(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_offers%rowtype;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 perform public.care_ensure_offer(p_prospect_id); select * into v from public.care_offers where prospect_id=p_prospect_id for update;
 update public.care_offers set status=case when status='ready' then 'shared' else status end,shared_at=coalesce(shared_at,now()),updated_at=now(),updated_by=auth.uid() where id=v.id returning * into v;
 update public.sales_lead_workspaces set next_action='Monitor LabNarrative Care offer',next_action_due_at=now()+interval '7 days',updated_at=now() where prospect_id=p_prospect_id;
 insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(p_prospect_id,'care_offer_shared','care','LabNarrative Care offer marked as shared',jsonb_build_object('offer_id',v.id),auth.uid());
 return to_jsonb(v);
end;$$;

create or replace function public.care_admin_regenerate_link(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_offers%rowtype;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 select * into v from public.care_offers where prospect_id=p_prospect_id for update; if not found then raise exception 'Care offer not found'; end if;
 if exists(select 1 from public.care_subscriptions where offer_id=v.id and status in ('active','suspended')) then raise exception 'Cannot regenerate the portal link while a Care subscription is active'; end if;
 update public.care_offers set token=gen_random_uuid(),link_enabled=true,status='ready',first_viewed_at=null,last_viewed_at=null,view_count=0,shared_at=null,valid_until=current_date+30,updated_at=now(),updated_by=auth.uid() where id=v.id returning * into v;
 return to_jsonb(v);
end;$$;

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
  'subscription',case when v_sub.id is null then null else jsonb_build_object('id',v_sub.id,'status',v_sub.status,'plan_name',v_sub.plan_name,'billing_interval',v_sub.billing_interval,'price_amount',v_sub.price_amount,'currency',v_sub.currency,'subscriber_name',v_sub.subscriber_name,'subscriber_email',v_sub.subscriber_email,'started_at',v_sub.started_at,'next_billing_at',v_sub.next_billing_at,'last_payment_at',v_sub.last_payment_at) end,
  'requests',case when v_sub.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'category',r.category,'subject',r.subject,'details',r.details,'status',r.status,'submitted_at',r.submitted_at,'completed_at',r.completed_at) order by r.submitted_at desc) from public.care_requests r where r.subscription_id=v_sub.id),'[]'::jsonb) end
 );
end;$$;

create or replace function public.care_public_decline(p_token uuid,p_name text,p_email text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_offers%rowtype;
begin
 if coalesce(length(trim(p_name)),0)<2 then return jsonb_build_object('error','Please enter your name'); end if;
 select * into v from public.care_offers where token=p_token and link_enabled=true for update; if not found then return jsonb_build_object('error','Care offer not found'); end if;
 if exists(select 1 from public.care_subscriptions where offer_id=v.id and status in ('active','suspended')) then return jsonb_build_object('error','An active Care subscription already exists'); end if;
 update public.care_offers set status='declined',client_name=trim(p_name),client_email=nullif(trim(coalesce(p_email,'')),''),declined_at=now(),updated_at=now() where id=v.id returning * into v;
 update public.sales_lead_workspaces set next_action=null,next_action_due_at=null,updated_at=now() where prospect_id=v.prospect_id;
 insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'care_declined','care','Client declined LabNarrative Care',jsonb_build_object('offer_id',v.id));
 return jsonb_build_object('ok',true,'status','declined');
end;$$;

create or replace function public.care_public_request_submit(p_token uuid,p_category text,p_subject text,p_details text,p_name text default null,p_email text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.care_offers%rowtype; v_sub public.care_subscriptions%rowtype; v_req public.care_requests%rowtype;
begin
 if p_category not in ('publication','team','opportunity','text','image','domain','other') then return jsonb_build_object('error','Invalid request category'); end if;
 if coalesce(length(trim(p_subject)),0)<3 or coalesce(length(trim(p_details)),0)<10 then return jsonb_build_object('error','Please provide a subject and enough detail for the requested update'); end if;
 select * into v_offer from public.care_offers where token=p_token and link_enabled=true; if not found then return jsonb_build_object('error','Care portal not found'); end if;
 select * into v_sub from public.care_subscriptions where offer_id=v_offer.id and status='active' order by created_at desc limit 1; if not found then return jsonb_build_object('error','An active Care subscription is required'); end if;
 insert into public.care_requests(subscription_id,prospect_id,site_id,category,subject,details,client_name,client_email)
 values(v_sub.id,v_sub.prospect_id,v_sub.site_id,p_category,trim(p_subject),trim(p_details),nullif(trim(coalesce(p_name,'')),''),nullif(trim(coalesce(p_email,'')),'')) returning * into v_req;
 update public.sales_lead_workspaces set next_action='Review Care update request',next_action_due_at=now(),updated_at=now() where prospect_id=v_sub.prospect_id;
 insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v_sub.prospect_id,'care_request_submitted','care','Client submitted a LabNarrative Care update request',jsonb_build_object('request_id',v_req.id,'category',v_req.category,'subject',v_req.subject));
 return jsonb_build_object('ok',true,'request',to_jsonb(v_req));
end;$$;

create or replace function public.care_admin_request_update(p_request_id uuid,p_status text,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_requests%rowtype;
begin
 if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
 if p_status not in ('submitted','reviewing','scheduled','completed','declined') then raise exception 'Invalid Care request status'; end if;
 select * into v from public.care_requests where id=p_request_id for update; if not found then raise exception 'Care request not found'; end if;
 update public.care_requests set status=p_status,admin_notes=coalesce(p_admin_notes,admin_notes),completed_at=case when p_status='completed' then coalesce(completed_at,now()) else null end,updated_at=now(),updated_by=auth.uid() where id=v.id returning * into v;
 if p_status='completed' then
  update public.sales_lead_workspaces set next_action=null,next_action_due_at=null,updated_at=now() where prospect_id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(v.prospect_id,'care_request_completed','care','LabNarrative Care update request completed',jsonb_build_object('request_id',v.id,'subject',v.subject),auth.uid());
 end if;
 return to_jsonb(v);
end;$$;

create or replace function public.care_provider_bind_subscription(p_offer_id uuid,p_plan_id uuid,p_provider_subscription_id text,p_status text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.care_offers%rowtype; v_plan public.care_plans%rowtype; v_sub public.care_subscriptions%rowtype;
begin
 select * into v_offer from public.care_offers where id=p_offer_id for update; if not found then raise exception 'Care offer not found'; end if;
 select * into v_plan from public.care_plans where id=p_plan_id and is_active; if not found then raise exception 'Care plan not found'; end if;
 select * into v_sub from public.care_subscriptions where provider_subscription_id=p_provider_subscription_id;
 if v_sub.id is null then
  insert into public.care_subscriptions(offer_id,prospect_id,site_id,plan_id,status,provider_subscription_id,plan_name,billing_interval,price_amount,currency,provider_metadata)
  values(v_offer.id,v_offer.prospect_id,v_offer.site_id,v_plan.id,case when upper(p_status)='ACTIVE' then 'active' else 'approval_pending' end,p_provider_subscription_id,v_plan.name,v_plan.billing_interval,v_plan.price_amount,v_plan.currency,coalesce(p_metadata,'{}'::jsonb)) returning * into v_sub;
 end if;
 update public.care_offers set status=case when v_sub.status='active' then 'active' else 'accepted' end,selected_plan_id=v_plan.id,accepted_at=coalesce(accepted_at,now()),updated_at=now() where id=v_offer.id;
 return to_jsonb(v_sub);
end;$$;

create or replace function public.care_provider_sync_subscription(p_provider_subscription_id text,p_status text,p_subscriber_name text default null,p_subscriber_email text default null,p_started_at timestamptz default null,p_next_billing_at timestamptz default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.care_subscriptions%rowtype; v_state text;
begin
 select * into v from public.care_subscriptions where provider_subscription_id=p_provider_subscription_id for update; if not found then raise exception 'Care subscription not found'; end if;
 v_state:=case upper(coalesce(p_status,'')) when 'ACTIVE' then 'active' when 'SUSPENDED' then 'suspended' when 'CANCELLED' then 'cancelled' when 'EXPIRED' then 'expired' when 'APPROVAL_PENDING' then 'approval_pending' else v.status end;
 update public.care_subscriptions set status=v_state,subscriber_name=coalesce(nullif(trim(coalesce(p_subscriber_name,'')),''),subscriber_name),subscriber_email=coalesce(nullif(trim(coalesce(p_subscriber_email,'')),''),subscriber_email),started_at=coalesce(started_at,p_started_at,case when v_state='active' then now() else null end),next_billing_at=coalesce(p_next_billing_at,next_billing_at),suspended_at=case when v_state='suspended' then coalesce(suspended_at,now()) else suspended_at end,cancelled_at=case when v_state='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,provider_metadata=provider_metadata||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=v.id returning * into v;
 update public.care_offers set status=case when v_state='active' then 'active' when v_state='cancelled' then 'cancelled' else status end,updated_at=now() where id=v.offer_id;
 if v_state='active' then
  update public.sales_lead_workspaces set next_action=null,next_action_due_at=null,updated_at=now() where prospect_id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload) select v.prospect_id,'care_activated','care','LabNarrative Care subscription activated',jsonb_build_object('subscription_id',v.id,'plan',v.plan_name,'amount',v.price_amount,'currency',v.currency,'interval',v.billing_interval) where not exists(select 1 from public.pipeline_events e where e.prospect_id=v.prospect_id and e.event_type='care_activated' and e.payload->>'subscription_id'=v.id::text);
 elsif v_state in ('suspended','cancelled') then
  update public.sales_lead_workspaces set next_action=case when v_state='suspended' then 'Resolve Care subscription payment issue' else 'Review cancelled Care subscription' end,next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
 end if;
 return to_jsonb(v);
end;$$;

create or replace function public.care_provider_record_payment(p_provider_subscription_id text,p_provider_payment_id text,p_amount numeric,p_currency text,p_paid_at timestamptz,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sub public.care_subscriptions%rowtype; v_pay public.care_subscription_payments%rowtype;
begin
 select * into v_sub from public.care_subscriptions where provider_subscription_id=p_provider_subscription_id for update; if not found then raise exception 'Care subscription not found'; end if;
 insert into public.care_subscription_payments(subscription_id,provider_payment_id,status,amount,currency,paid_at,provider_metadata)
 values(v_sub.id,p_provider_payment_id,'completed',round(p_amount,2),upper(p_currency),coalesce(p_paid_at,now()),coalesce(p_metadata,'{}'::jsonb)) on conflict(provider_payment_id) do update set provider_metadata=public.care_subscription_payments.provider_metadata||excluded.provider_metadata returning * into v_pay;
 update public.care_subscriptions set status='active',last_payment_at=v_pay.paid_at,last_payment_amount=v_pay.amount,updated_at=now() where id=v_sub.id;
 update public.care_offers set status='active',updated_at=now() where id=v_sub.offer_id;
 return to_jsonb(v_pay);
end;$$;

create or replace function public.sales_client_handover_public_acknowledge(p_token uuid,p_name text,p_email text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.sales_client_launches%rowtype; v_offer_id uuid;
begin
 if coalesce(length(trim(p_name)),0)<2 then return jsonb_build_object('error','Please enter your name'); end if;
 select * into v from public.sales_client_launches where handover_token=p_token and handover_link_enabled=true and status in ('launched','handover_sent','completed') for update;
 if not found then return jsonb_build_object('error','Handover link not found or disabled'); end if;
 if v.status<>'completed' then
  update public.sales_client_launches set status='completed',handover_acknowledged_at=now(),handover_client_name=trim(p_name),handover_client_email=nullif(trim(coalesce(p_email,'')),''),updated_at=now() where id=v.id returning * into v;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'handover_acknowledged','client_delivery','Client acknowledged website handover',jsonb_build_object('launch_id',v.id,'client_name',trim(p_name)));
 end if;
 v_offer_id:=public.care_ensure_offer(v.prospect_id);
 update public.care_offers set client_name=coalesce(client_name,trim(p_name)),client_email=coalesce(client_email,nullif(trim(coalesce(p_email,'')),'')),updated_at=now() where id=v_offer_id;
 update public.sales_lead_workspaces set next_action='Send LabNarrative Care offer',next_action_due_at=now()+interval '7 days',updated_at=now() where prospect_id=v.prospect_id;
 return jsonb_build_object('ok',true,'status','completed','acknowledged_at',v.handover_acknowledged_at,'care_offer_ready',true);
end;$$;

revoke all on function public.care_ensure_offer(uuid) from public,anon,authenticated;
grant execute on function public.care_ensure_offer(uuid) to service_role;
revoke all on function public.care_admin_dashboard() from public,anon;
grant execute on function public.care_admin_dashboard() to authenticated;
revoke all on function public.care_admin_plan_save(uuid,text,text,numeric,text,jsonb,boolean,integer) from public,anon;
grant execute on function public.care_admin_plan_save(uuid,text,text,numeric,text,jsonb,boolean,integer) to authenticated;
revoke all on function public.care_admin_get(uuid) from public,anon;
grant execute on function public.care_admin_get(uuid) to authenticated;
revoke all on function public.care_admin_mark_shared(uuid) from public,anon;
grant execute on function public.care_admin_mark_shared(uuid) to authenticated;
revoke all on function public.care_admin_regenerate_link(uuid) from public,anon;
grant execute on function public.care_admin_regenerate_link(uuid) to authenticated;
revoke all on function public.care_public_get(uuid) from public;
grant execute on function public.care_public_get(uuid) to anon,authenticated;
revoke all on function public.care_public_decline(uuid,text,text) from public;
grant execute on function public.care_public_decline(uuid,text,text) to anon,authenticated;
revoke all on function public.care_public_request_submit(uuid,text,text,text,text,text) from public;
grant execute on function public.care_public_request_submit(uuid,text,text,text,text,text) to anon,authenticated;
revoke all on function public.care_admin_request_update(uuid,text,text) from public,anon;
grant execute on function public.care_admin_request_update(uuid,text,text) to authenticated;
revoke all on function public.care_provider_bind_subscription(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.care_provider_bind_subscription(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.care_provider_sync_subscription(text,text,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.care_provider_sync_subscription(text,text,text,text,timestamptz,timestamptz,jsonb) to service_role;
revoke all on function public.care_provider_record_payment(text,text,numeric,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.care_provider_record_payment(text,text,numeric,text,timestamptz,jsonb) to service_role;
revoke all on function public.sales_client_handover_public_acknowledge(uuid,text,text) from public;
grant execute on function public.sales_client_handover_public_acknowledge(uuid,text,text) to anon,authenticated;