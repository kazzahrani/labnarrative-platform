create table if not exists public.sales_client_final_reviews (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  onboarding_id uuid not null references public.sales_client_onboarding(id) on delete restrict,
  proposal_id uuid not null references public.sales_proposals(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  share_token uuid not null default gen_random_uuid() unique,
  link_enabled boolean not null default true,
  status text not null default 'ready' check (status in ('ready','sent','viewed','changes_requested','approved','superseded')),
  site_updated_at timestamptz not null,
  site_revision_id uuid null references public.site_revisions(id) on delete set null,
  site_url text not null,
  client_name text null,
  client_email text null,
  change_request text not null default '',
  admin_note text not null default '',
  prepared_at timestamptz not null default now(),
  sent_at timestamptz null,
  first_viewed_at timestamptz null,
  last_viewed_at timestamptz null,
  view_count integer not null default 0 check (view_count >= 0),
  changes_requested_at timestamptz null,
  approved_at timestamptz null,
  superseded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  unique(prospect_id, version)
);
create index if not exists sales_client_final_reviews_prospect_idx on public.sales_client_final_reviews(prospect_id, version desc);
create index if not exists sales_client_final_reviews_status_idx on public.sales_client_final_reviews(status, updated_at desc);
alter table public.sales_client_final_reviews enable row level security;
revoke all on public.sales_client_final_reviews from anon, authenticated;

alter table public.sales_lead_workspaces drop constraint if exists sales_lead_workspaces_payment_status_check;
alter table public.sales_lead_workspaces add constraint sales_lead_workspaces_payment_status_check
  check (payment_status = any(array['not_requested'::text,'deposit_requested'::text,'deposit_received'::text,'balance_requested'::text,'paid_in_full'::text,'refunded'::text]));

create or replace function public.sales_client_final_review_admin_get(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_prospect public.prospects%rowtype; v_site public.sites%rowtype; v_onboarding public.sales_client_onboarding%rowtype; v_review public.sales_client_final_reviews%rowtype; v_deposit public.sales_payment_requests%rowtype; v_balance public.sales_payment_requests%rowtype; v_proposal public.sales_proposals%rowtype; v_eligible boolean := false; v_stale boolean := false;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_prospect from public.prospects where id=p_prospect_id; if not found then raise exception 'Prospect not found'; end if;
  if v_prospect.site_id is not null then select * into v_site from public.sites where id=v_prospect.site_id; end if;
  select * into v_onboarding from public.sales_client_onboarding where prospect_id=p_prospect_id;
  select * into v_review from public.sales_client_final_reviews where prospect_id=p_prospect_id order by version desc limit 1;
  select * into v_deposit from public.sales_payment_requests where prospect_id=p_prospect_id and kind='deposit' order by created_at desc limit 1;
  select * into v_balance from public.sales_payment_requests where prospect_id=p_prospect_id and kind='balance' order by created_at desc limit 1;
  select * into v_proposal from public.sales_proposals where prospect_id=p_prospect_id order by updated_at desc limit 1;
  v_eligible := v_site.id is not null and v_onboarding.status='completed' and v_deposit.status='paid' and v_proposal.status='accepted';
  if v_review.id is not null and v_site.id is not null then v_stale := v_site.updated_at is distinct from v_review.site_updated_at; end if;
  return jsonb_build_object(
    'prospect',jsonb_build_object('id',v_prospect.id,'pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department,'email',v_prospect.email),
    'site',case when v_site.id is null then null else jsonb_build_object('id',v_site.id,'slug',v_site.slug,'status',v_site.status,'domain_url',v_site.domain_url,'updated_at',v_site.updated_at) end,
    'onboarding',case when v_onboarding.id is null then null else jsonb_build_object('id',v_onboarding.id,'status',v_onboarding.status,'completed_at',v_onboarding.completed_at) end,
    'proposal',case when v_proposal.id is null then null else jsonb_build_object('id',v_proposal.id,'status',v_proposal.status,'version',v_proposal.version,'price_amount',v_proposal.price_amount,'currency',v_proposal.currency,'deposit_percent',v_proposal.deposit_percent) end,
    'deposit',case when v_deposit.id is null then null else jsonb_build_object('id',v_deposit.id,'status',v_deposit.status,'amount',v_deposit.amount,'currency',v_deposit.currency,'paid_at',v_deposit.paid_at) end,
    'balance',case when v_balance.id is null then null else jsonb_build_object('id',v_balance.id,'token',v_balance.token,'status',v_balance.status,'amount',v_balance.amount,'currency',v_balance.currency,'paid_at',v_balance.paid_at) end,
    'review',case when v_review.id is null then null else to_jsonb(v_review) end,'eligible',v_eligible,'stale',v_stale);
end;$$;

create or replace function public.sales_client_final_review_admin_prepare(p_prospect_id uuid,p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_site public.sites%rowtype; v_onboarding public.sales_client_onboarding%rowtype; v_proposal public.sales_proposals%rowtype; v_deposit public.sales_payment_requests%rowtype; v_latest public.sales_client_final_reviews%rowtype; v_revision_id uuid; v_version integer; v_url text; v_new public.sales_client_final_reviews%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select s.* into v_site from public.sites s join public.prospects p on p.site_id=s.id where p.id=p_prospect_id; if not found then raise exception 'Website not found for this client'; end if;
  select * into v_onboarding from public.sales_client_onboarding where prospect_id=p_prospect_id; if not found or v_onboarding.status <> 'completed' then raise exception 'Complete client onboarding before preparing final review'; end if;
  select * into v_proposal from public.sales_proposals where prospect_id=p_prospect_id and status='accepted' order by updated_at desc limit 1; if not found then raise exception 'Accepted proposal not found'; end if;
  select * into v_deposit from public.sales_payment_requests where prospect_id=p_prospect_id and kind='deposit' and status='paid' order by paid_at desc limit 1; if not found then raise exception 'Paid deposit not found'; end if;
  select * into v_latest from public.sales_client_final_reviews where prospect_id=p_prospect_id order by version desc limit 1 for update;
  if v_latest.id is not null and v_latest.status in ('ready','sent','viewed') and v_latest.site_updated_at is not distinct from v_site.updated_at then return jsonb_build_object('ok',true,'review',to_jsonb(v_latest),'reused',true); end if;
  if v_latest.id is not null and v_latest.status='approved' then raise exception 'The final website has already been approved'; end if;
  if v_latest.id is not null and v_latest.status='changes_requested' and v_latest.site_updated_at is not distinct from v_site.updated_at then raise exception 'Publish the requested website changes before preparing a revised review'; end if;
  update public.sales_client_final_reviews set status='superseded',link_enabled=false,superseded_at=now(),updated_at=now() where prospect_id=p_prospect_id and status in ('ready','sent','viewed','changes_requested');
  select id into v_revision_id from public.site_revisions where site_id=v_site.id and status='published' order by published_at desc nulls last, updated_at desc limit 1;
  select coalesce(max(version),0)+1 into v_version from public.sales_client_final_reviews where prospect_id=p_prospect_id;
  v_url := coalesce(nullif(v_site.domain_url,''),'https://' || v_site.slug || '.labnarrative.com');
  insert into public.sales_client_final_reviews(prospect_id,site_id,onboarding_id,proposal_id,version,status,site_updated_at,site_revision_id,site_url,admin_note,created_by)
  values(p_prospect_id,v_site.id,v_onboarding.id,v_proposal.id,v_version,'ready',v_site.updated_at,v_revision_id,v_url,left(coalesce(p_admin_note,''),4000),auth.uid()) returning * into v_new;
  update public.sales_lead_workspaces set next_action='Send final website review link',next_action_due_at=now(),updated_at=now(),updated_by=auth.uid() where prospect_id=p_prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(p_prospect_id,'client_final_review_prepared','client_delivery','Final website review prepared',jsonb_build_object('review_id',v_new.id,'version',v_new.version,'site_updated_at',v_new.site_updated_at),auth.uid());
  return jsonb_build_object('ok',true,'review',to_jsonb(v_new),'reused',false);
end;$$;

create or replace function public.sales_client_final_review_admin_mark_sent(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_client_final_reviews%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_client_final_reviews where prospect_id=p_prospect_id and link_enabled=true order by version desc limit 1 for update; if not found then raise exception 'Prepare final review first'; end if;
  if v.status in ('approved','changes_requested','superseded') then raise exception 'This review can no longer be marked sent'; end if;
  update public.sales_client_final_reviews set status=case when status='ready' then 'sent' else status end,sent_at=coalesce(sent_at,now()),updated_at=now() where id=v.id returning * into v;
  update public.sales_lead_workspaces set next_action='Wait for client website approval',next_action_due_at=now()+interval '3 days',updated_at=now(),updated_by=auth.uid() where prospect_id=p_prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(p_prospect_id,'client_final_review_sent','client_delivery','Final website review link marked sent',jsonb_build_object('review_id',v.id,'version',v.version),auth.uid());
  return jsonb_build_object('ok',true,'review',to_jsonb(v));
end;$$;

create or replace function public.sales_client_final_review_public_get(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_client_final_reviews%rowtype; v_site public.sites%rowtype; v_prospect public.prospects%rowtype; v_balance public.sales_payment_requests%rowtype; v_stale boolean;
begin
  select * into v from public.sales_client_final_reviews where share_token=p_token and link_enabled=true and status<>'superseded' for update; if not found then return jsonb_build_object('error','Final review link not found or disabled'); end if;
  select * into v_site from public.sites where id=v.site_id; select * into v_prospect from public.prospects where id=v.prospect_id; select * into v_balance from public.sales_payment_requests where proposal_id=v.proposal_id and kind='balance' order by created_at desc limit 1;
  v_stale := v_site.updated_at is distinct from v.site_updated_at;
  if v.status in ('ready','sent') then update public.sales_client_final_reviews set status='viewed',first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  elsif v.status not in ('approved','changes_requested') then update public.sales_client_final_reviews set last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v; end if;
  return jsonb_build_object('review',jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'site_url',v.site_url,'prepared_at',v.prepared_at,'sent_at',v.sent_at,'approved_at',v.approved_at,'changes_requested_at',v.changes_requested_at,'change_request',case when v.status='changes_requested' then v.change_request else '' end),'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),'site',jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'updated_at',v_site.updated_at),'stale',v_stale,'balance',case when v_balance.id is null then null else jsonb_build_object('token',v_balance.token,'status',v_balance.status,'amount',v_balance.amount,'currency',v_balance.currency,'paid_at',v_balance.paid_at) end);
end;$$;

create or replace function public.sales_client_final_review_public_decide(p_token uuid,p_decision text,p_name text,p_email text default null,p_changes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_client_final_reviews%rowtype; v_site public.sites%rowtype; v_proposal public.sales_proposals%rowtype; v_deposit public.sales_payment_requests%rowtype; v_balance public.sales_payment_requests%rowtype; v_amount numeric;
begin
  if p_decision not in ('approve','changes') then return jsonb_build_object('error','Invalid review decision'); end if; if coalesce(length(trim(p_name)),0)<2 then return jsonb_build_object('error','Please enter your name'); end if;
  select * into v from public.sales_client_final_reviews where share_token=p_token and link_enabled=true and status<>'superseded' for update; if not found then return jsonb_build_object('error','Final review link not found or disabled'); end if;
  select * into v_site from public.sites where id=v.site_id for update; if v_site.updated_at is distinct from v.site_updated_at then return jsonb_build_object('error','The website has changed since this review was prepared. Please request a fresh review link.','stale',true); end if;
  if v.status='approved' then select * into v_balance from public.sales_payment_requests where proposal_id=v.proposal_id and kind='balance'; return jsonb_build_object('ok',true,'status','approved','payment_token',v_balance.token,'payment_status',v_balance.status); end if;
  if p_decision='changes' then
    if coalesce(length(trim(p_changes)),0)<5 then return jsonb_build_object('error','Please describe the changes you would like us to make'); end if;
    update public.sales_client_final_reviews set status='changes_requested',client_name=trim(p_name),client_email=nullif(trim(coalesce(p_email,'')),''),change_request=left(trim(p_changes),12000),changes_requested_at=now(),updated_at=now() where id=v.id returning * into v;
    update public.sales_lead_workspaces set next_action='Apply client final review changes',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'client_final_changes_requested','client_delivery','Client requested final website changes',jsonb_build_object('review_id',v.id,'version',v.version));
    return jsonb_build_object('ok',true,'status','changes_requested');
  end if;
  select * into v_proposal from public.sales_proposals where id=v.proposal_id; select * into v_deposit from public.sales_payment_requests where proposal_id=v.proposal_id and kind='deposit' and status='paid' order by paid_at desc limit 1; if not found then return jsonb_build_object('error','The project deposit is not recorded as paid'); end if;
  v_amount := greatest(0,round(v_proposal.price_amount - v_deposit.amount,2));
  update public.sales_client_final_reviews set status='approved',client_name=trim(p_name),client_email=nullif(trim(coalesce(p_email,'')),''),approved_at=now(),updated_at=now() where id=v.id returning * into v;
  if v_amount > 0 then
    insert into public.sales_payment_requests(proposal_id,proposal_version,prospect_id,site_id,kind,status,proposal_amount,deposit_percent,amount,currency,balance_after,provider,valid_until,requested_at)
    values(v_proposal.id,v_proposal.version,v.prospect_id,v.site_id,'balance','requested',v_proposal.price_amount,v_proposal.deposit_percent,v_amount,upper(v_proposal.currency),0,'paypal',current_date+14,now())
    on conflict(proposal_id,kind) do update set updated_at=public.sales_payment_requests.updated_at returning * into v_balance;
    update public.sales_lead_workspaces set payment_status='balance_requested',next_action='Monitor final balance payment',next_action_due_at=now()+interval '3 days',updated_at=now() where prospect_id=v.prospect_id;
  else update public.sales_lead_workspaces set payment_status='paid_in_full',next_action='Launch website',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id; end if;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'client_final_website_approved','client_delivery','Client approved final website',jsonb_build_object('review_id',v.id,'version',v.version,'balance_amount',v_amount,'currency',v_proposal.currency,'payment_id',v_balance.id));
  return jsonb_build_object('ok',true,'status','approved','payment_token',case when v_balance.id is null then null else v_balance.token end,'payment_status',case when v_balance.id is null then 'paid_in_full' else v_balance.status end,'balance_amount',v_amount,'currency',v_proposal.currency);
end;$$;

create or replace function public.sales_client_onboarding_admin_status(p_prospect_id uuid,p_status text,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_client_onboarding%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if; if p_status not in ('reviewing','changes_requested','approved','completed') then raise exception 'Invalid onboarding status'; end if;
  update public.sales_client_onboarding set status=p_status,admin_notes=case when p_admin_notes is null then admin_notes else left(p_admin_notes,8000) end,reviewed_at=case when p_status in ('reviewing','changes_requested','approved','completed') then coalesce(reviewed_at,now()) else reviewed_at end,approved_at=case when p_status in ('approved','completed') then coalesce(approved_at,now()) else approved_at end,completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,updated_at=now(),updated_by=auth.uid() where prospect_id=p_prospect_id returning * into v;
  if not found then raise exception 'Client onboarding not found'; end if;
  update public.sales_lead_workspaces set next_action=case when p_status='changes_requested' then 'Wait for client onboarding revisions' when p_status='approved' then 'Apply approved onboarding changes to website' when p_status='completed' then 'Prepare client final review' else 'Review client onboarding submission' end,next_action_due_at=case when p_status='changes_requested' then null else now() end,updated_at=now(),updated_by=auth.uid() where prospect_id=p_prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(v.prospect_id,'client_onboarding_'||p_status,'client_onboarding','Client onboarding status changed to '||p_status,jsonb_build_object('onboarding_id',v.id),auth.uid()); return jsonb_build_object('ok',true,'status',v.status,'updated_at',v.updated_at);
end;$$;

create or replace function public.sales_payment_provider_complete(p_payment_id uuid,p_order_id text,p_capture_id text,p_capture_status text,p_capture_amount numeric,p_capture_currency text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_payment_requests%rowtype; v_site_id uuid; v_payer_name text; v_payer_email text; v_onboarding public.sales_client_onboarding%rowtype;
begin
  select * into v from public.sales_payment_requests where id=p_payment_id for update; if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then if v.kind='deposit' then select * into v_onboarding from public.sales_client_onboarding where payment_id=v.id; if not found then perform public.sales_ensure_client_onboarding(v.id); end if; end if; return to_jsonb(v); end if;
  if v.status in ('cancelled','expired','refunded') then raise exception 'Payment request is closed'; end if; if coalesce(v.provider_order_id,'') <> coalesce(trim(p_order_id),'') then raise exception 'Provider order does not match this payment request'; end if; if upper(coalesce(trim(p_capture_status),'')) <> 'COMPLETED' then raise exception 'Provider capture is not completed'; end if; if p_capture_amount is null or round(p_capture_amount,2) <> round(v.amount,2) then raise exception 'Captured amount does not match the requested amount'; end if; if upper(coalesce(trim(p_capture_currency),'')) <> upper(v.currency) then raise exception 'Captured currency does not match the requested currency'; end if; if coalesce(length(trim(p_capture_id)),0)=0 then raise exception 'Provider capture ID is required'; end if;
  v_payer_name := nullif(trim(coalesce(p_metadata#>>'{payer,name}','')),''); v_payer_email := nullif(trim(coalesce(p_metadata#>>'{payer,email}','')),'');
  update public.sales_payment_requests set status='paid',provider_capture_id=trim(p_capture_id),paid_at=now(),payer_name=coalesce(v_payer_name,payer_name),payer_email=coalesce(v_payer_email,payer_email),provider_metadata=provider_metadata||coalesce(p_metadata,'{}'::jsonb),failure_message=null,failed_at=null,updated_at=now() where id=v.id returning * into v;
  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  if v.kind='deposit' then
    update public.sales_lead_workspaces set stage='client',payment_status='deposit_received',deposit_amount=v.amount,deposit_percent=v.deposit_percent,deposit_received_at=now(),next_action='Send client onboarding link',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
    if v_site_id is not null then update public.sites set outreach_status='client',updated_at=now() where id=v_site_id; end if; update public.prospects set status='interested',updated_at=now() where id=v.prospect_id; select * into v_onboarding from public.sales_ensure_client_onboarding(v.id);
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'deposit_received','sales_conversion','Deposit payment captured successfully; onboarding opened',jsonb_build_object('payment_id',v.id,'proposal_id',v.proposal_id,'amount',v.amount,'currency',v.currency,'provider',v.provider,'provider_order_id',p_order_id,'provider_capture_id',p_capture_id,'onboarding_id',v_onboarding.id));
  elsif v.kind='balance' then
    update public.sales_lead_workspaces set stage='client',payment_status='paid_in_full',next_action='Launch website',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'final_balance_received','client_delivery','Final project balance captured successfully',jsonb_build_object('payment_id',v.id,'amount',v.amount,'currency',v.currency,'provider_order_id',p_order_id,'provider_capture_id',p_capture_id));
  else update public.sales_lead_workspaces set next_action='Review received project payment',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id; end if;
  return to_jsonb(v);
end;$$;

create or replace function public.sales_payment_admin_mark_received(p_payment_id uuid,p_reference text default null,p_payer_name text default null,p_payer_email text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_payment_requests%rowtype; v_site_id uuid; v_onboarding public.sales_client_onboarding%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if; select * into v from public.sales_payment_requests where id=p_payment_id for update; if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then if v.kind='deposit' then select * into v_onboarding from public.sales_client_onboarding where payment_id=v.id; if not found then perform public.sales_ensure_client_onboarding(v.id); end if; end if; return to_jsonb(v); end if;
  if v.status in ('cancelled','expired','refunded') then raise exception 'This payment request is not payable'; end if;
  update public.sales_payment_requests set status='paid',paid_at=now(),updated_at=now(),updated_by=auth.uid(),provider_capture_id=coalesce(nullif(trim(p_reference),''),provider_capture_id),payer_name=coalesce(nullif(trim(p_payer_name),''),payer_name),payer_email=coalesce(nullif(trim(p_payer_email),''),payer_email),provider_metadata=provider_metadata||jsonb_build_object('manual_confirmation',true,'confirmed_by',auth.uid()) where id=v.id returning * into v;
  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  if v.kind='deposit' then
    update public.sales_lead_workspaces set stage='client',payment_status='deposit_received',deposit_amount=v.amount,deposit_percent=v.deposit_percent,deposit_received_at=now(),next_action='Send client onboarding link',next_action_due_at=now(),updated_at=now(),updated_by=auth.uid() where prospect_id=v.prospect_id;
    if v_site_id is not null then update public.sites set outreach_status='client',updated_at=now() where id=v_site_id; end if; update public.prospects set status='interested',updated_at=now() where id=v.prospect_id; select * into v_onboarding from public.sales_ensure_client_onboarding(v.id);
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(v.prospect_id,'deposit_received','sales_conversion','Deposit payment manually confirmed; onboarding opened',jsonb_build_object('payment_id',v.id,'amount',v.amount,'currency',v.currency,'reference',p_reference,'onboarding_id',v_onboarding.id),auth.uid());
  elsif v.kind='balance' then
    update public.sales_lead_workspaces set stage='client',payment_status='paid_in_full',next_action='Launch website',next_action_due_at=now(),updated_at=now(),updated_by=auth.uid() where prospect_id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(v.prospect_id,'final_balance_received','client_delivery','Final project balance manually confirmed',jsonb_build_object('payment_id',v.id,'amount',v.amount,'currency',v.currency,'reference',p_reference),auth.uid());
  else update public.sales_lead_workspaces set next_action='Review received project payment',next_action_due_at=now(),updated_at=now(),updated_by=auth.uid() where prospect_id=v.prospect_id; end if;
  return to_jsonb(v);
end;$$;

revoke all on function public.sales_client_final_review_admin_get(uuid) from public,anon; grant execute on function public.sales_client_final_review_admin_get(uuid) to authenticated,service_role;
revoke all on function public.sales_client_final_review_admin_prepare(uuid,text) from public,anon; grant execute on function public.sales_client_final_review_admin_prepare(uuid,text) to authenticated,service_role;
revoke all on function public.sales_client_final_review_admin_mark_sent(uuid) from public,anon; grant execute on function public.sales_client_final_review_admin_mark_sent(uuid) to authenticated,service_role;
revoke all on function public.sales_client_final_review_public_get(uuid) from public; grant execute on function public.sales_client_final_review_public_get(uuid) to anon,authenticated,service_role;
revoke all on function public.sales_client_final_review_public_decide(uuid,text,text,text,text) from public; grant execute on function public.sales_client_final_review_public_decide(uuid,text,text,text,text) to anon,authenticated,service_role;
revoke all on function public.sales_client_onboarding_admin_status(uuid,text,text) from public,anon; grant execute on function public.sales_client_onboarding_admin_status(uuid,text,text) to authenticated,service_role;
revoke all on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) from public,anon,authenticated; grant execute on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) to service_role;
revoke all on function public.sales_payment_admin_mark_received(uuid,text,text,text) from public,anon; grant execute on function public.sales_payment_admin_mark_received(uuid,text,text,text) to authenticated,service_role;
