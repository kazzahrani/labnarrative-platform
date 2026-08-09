create table if not exists public.sales_payment_requests (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  proposal_version integer not null check (proposal_version > 0),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  kind text not null default 'deposit' check (kind in ('deposit','balance','custom')),
  status text not null default 'requested' check (status in ('ready','requested','viewed','processing','paid','failed','cancelled','expired','refunded')),
  token uuid not null default gen_random_uuid() unique,
  proposal_amount numeric(12,2) not null check (proposal_amount >= 0),
  deposit_percent numeric(5,2) not null check (deposit_percent >= 0 and deposit_percent <= 100),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  balance_after numeric(12,2) not null default 0 check (balance_after >= 0),
  provider text not null default 'paypal',
  provider_order_id text null,
  provider_capture_id text null,
  payer_name text null,
  payer_email text null,
  valid_until date not null default (current_date + 14),
  requested_at timestamptz not null default now(),
  first_viewed_at timestamptz null,
  last_viewed_at timestamptz null,
  view_count integer not null default 0 check (view_count >= 0),
  processing_at timestamptz null,
  paid_at timestamptz null,
  failed_at timestamptz null,
  failure_message text null,
  cancelled_at timestamptz null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  unique(proposal_id, kind)
);

create unique index if not exists sales_payment_requests_provider_order_unique
  on public.sales_payment_requests(provider_order_id) where provider_order_id is not null;
create unique index if not exists sales_payment_requests_provider_capture_unique
  on public.sales_payment_requests(provider_capture_id) where provider_capture_id is not null;
create index if not exists sales_payment_requests_prospect_idx on public.sales_payment_requests(prospect_id, created_at desc);
create index if not exists sales_payment_requests_status_idx on public.sales_payment_requests(status, updated_at desc);

alter table public.sales_payment_requests enable row level security;
revoke all on public.sales_payment_requests from anon, authenticated;

drop function if exists public.sales_payment_public_get(uuid);
create function public.sales_payment_public_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_payment_requests%rowtype;
  v_proposal public.sales_proposals%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
begin
  select * into v from public.sales_payment_requests where token=p_token for update;
  if not found then return jsonb_build_object('error','Payment request not found'); end if;
  if v.status='cancelled' then return jsonb_build_object('error','This payment request has been cancelled'); end if;
  if v.valid_until < current_date and v.status not in ('paid','refunded') then
    update public.sales_payment_requests set status='expired',updated_at=now() where id=v.id returning * into v;
  end if;
  if v.status='expired' then return jsonb_build_object('error','This payment request has expired'); end if;

  if v.status in ('ready','requested') then
    update public.sales_payment_requests set
      status='viewed',first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now()
    where id=v.id returning * into v;
  elsif v.status not in ('paid','refunded') then
    update public.sales_payment_requests set last_viewed_at=now(),view_count=view_count+1,updated_at=now()
    where id=v.id returning * into v;
  end if;

  select * into v_proposal from public.sales_proposals where id=v.proposal_id;
  select * into v_prospect from public.prospects where id=v.prospect_id;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;

  return jsonb_build_object(
    'payment', jsonb_build_object(
      'id',v.id,'kind',v.kind,'status',v.status,'proposal_version',v.proposal_version,
      'proposal_amount',v.proposal_amount,'deposit_percent',v.deposit_percent,'amount',v.amount,
      'currency',v.currency,'balance_after',v.balance_after,'provider',v.provider,
      'valid_until',v.valid_until,'requested_at',v.requested_at,'paid_at',v.paid_at,
      'provider_order_id',v.provider_order_id,'provider_capture_id',v.provider_capture_id,
      'payer_name',v.payer_name,'payer_email',v.payer_email
    ),
    'proposal',jsonb_build_object('id',v_proposal.id,'title',v_proposal.title,'package_name',v_proposal.package_name,'status',v_proposal.status,'accepted_at',v_proposal.accepted_at),
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),
    'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'lab_name',v_site.content->>'labName') end
  );
end;
$$;

drop function if exists public.sales_payment_admin_get(uuid);
create function public.sales_payment_admin_get(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.sales_payment_requests%rowtype;
  v_proposal public.sales_proposals%rowtype;
  v_prospect public.prospects%rowtype;
  v_workspace public.sales_lead_workspaces%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_prospect from public.prospects where id=p_prospect_id;
  if not found then raise exception 'Prospect not found'; end if;
  select * into v_workspace from public.sales_lead_workspaces where prospect_id=p_prospect_id;
  select * into v_proposal from public.sales_proposals where prospect_id=p_prospect_id limit 1;
  select * into v_payment from public.sales_payment_requests where prospect_id=p_prospect_id order by created_at desc limit 1;
  return jsonb_build_object(
    'prospect',to_jsonb(v_prospect),
    'workspace',case when v_workspace.id is null then null else to_jsonb(v_workspace) end,
    'proposal',case when v_proposal.id is null then null else to_jsonb(v_proposal) end,
    'payment',case when v_payment.id is null then null else to_jsonb(v_payment) end
  );
end;
$$;

drop function if exists public.sales_payment_admin_mark_received(uuid,text,text,text);
create function public.sales_payment_admin_mark_received(p_payment_id uuid,p_reference text default null,p_payer_name text default null,p_payer_email text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_payment_requests%rowtype;
  v_site_id uuid;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then return to_jsonb(v); end if;
  if v.status in ('cancelled','expired','refunded') then raise exception 'This payment request is not payable'; end if;

  update public.sales_payment_requests set status='paid',paid_at=now(),updated_at=now(),updated_by=auth.uid(),
    provider_capture_id=coalesce(nullif(trim(p_reference),''),provider_capture_id),
    payer_name=coalesce(nullif(trim(p_payer_name),''),payer_name),
    payer_email=coalesce(nullif(trim(p_payer_email),''),payer_email),
    provider_metadata=provider_metadata || jsonb_build_object('manual_confirmation',true,'confirmed_by',auth.uid())
  where id=v.id returning * into v;

  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  update public.sales_lead_workspaces set stage='client',payment_status='deposit_received',deposit_amount=v.amount,deposit_percent=v.deposit_percent,
    deposit_received_at=now(),next_action='Begin client onboarding',next_action_due_at=now(),updated_at=now(),updated_by=auth.uid()
  where prospect_id=v.prospect_id;
  if v_site_id is not null then update public.sites set outreach_status='client',updated_at=now() where id=v_site_id; end if;
  update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(v.prospect_id,'deposit_received','sales_conversion','Deposit payment manually confirmed',jsonb_build_object('payment_id',v.id,'amount',v.amount,'currency',v.currency,'reference',p_reference),auth.uid());
  return to_jsonb(v);
end;
$$;

drop function if exists public.sales_public_proposal_decide(uuid,text,text,text);
create function public.sales_public_proposal_decide(p_token uuid,p_decision text,p_name text,p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_proposals%rowtype;
  v_site_id uuid;
  v_deposit numeric;
  v_balance numeric;
  v_payment public.sales_payment_requests%rowtype;
begin
  if p_decision not in ('accept','decline') then return jsonb_build_object('error','Invalid decision'); end if;
  if coalesce(length(trim(p_name)),0) < 2 then return jsonb_build_object('error','Please enter your name'); end if;
  select * into v from public.sales_proposals where share_token=p_token and share_enabled=true for update;
  if not found then return jsonb_build_object('error','Proposal not found or link disabled'); end if;
  if v.valid_until < current_date and v.status not in ('accepted','declined') then return jsonb_build_object('error','This proposal has expired'); end if;

  if v.status='accepted' then
    select * into v_payment from public.sales_payment_requests where proposal_id=v.id and kind='deposit';
    return jsonb_build_object('ok',true,'status','accepted','proposal_id',v.id,'payment_token',v_payment.token,'payment_status',v_payment.status);
  end if;
  if v.status='declined' then return jsonb_build_object('ok',true,'status','declined','proposal_id',v.id); end if;

  v_deposit := round(v.price_amount * v.deposit_percent / 100.0,2);
  v_balance := greatest(0,v.price_amount-v_deposit);
  select site_id into v_site_id from public.prospects where id=v.prospect_id;

  if p_decision='accept' then
    update public.sales_proposals set status='accepted',accepted_at=now(),accepted_by_name=trim(p_name),accepted_by_email=nullif(trim(coalesce(p_email,'')),''),updated_at=now()
    where id=v.id returning * into v;

    insert into public.sales_payment_requests(
      proposal_id,proposal_version,prospect_id,site_id,kind,status,proposal_amount,deposit_percent,amount,currency,balance_after,provider,valid_until,requested_at
    ) values(
      v.id,v.version,v.prospect_id,v_site_id,'deposit','requested',v.price_amount,v.deposit_percent,v_deposit,upper(v.currency),v_balance,'paypal',greatest(v.valid_until,current_date+14),now()
    ) on conflict(proposal_id,kind) do update set updated_at=public.sales_payment_requests.updated_at
    returning * into v_payment;

    insert into public.sales_lead_workspaces(prospect_id,stage,proposal_status,proposal_amount,proposal_currency,deposit_percent,deposit_amount,payment_status,next_action,next_action_due_at,updated_at)
    values(v.prospect_id,'proposal_sent','accepted',v.price_amount,v.currency,v.deposit_percent,v_deposit,'deposit_requested',null,null,now())
    on conflict(prospect_id) do update set proposal_status='accepted',proposal_amount=v.price_amount,proposal_currency=v.currency,deposit_percent=v.deposit_percent,
      deposit_amount=v_deposit,payment_status='deposit_requested',next_action=null,next_action_due_at=null,updated_at=now();
    if v_site_id is not null then update public.sites set outreach_status='proposal_sent',updated_at=now() where id=v_site_id; end if;
    update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    values(v.prospect_id,'proposal_accepted','sales_conversion','Proposal approved; deposit request prepared',jsonb_build_object('proposal_id',v.id,'version',v.version,'accepted_by',trim(p_name),'payment_id',v_payment.id,'deposit_amount',v_payment.amount,'currency',v_payment.currency));
  else
    update public.sales_proposals set status='declined',declined_at=now(),updated_at=now() where id=v.id returning * into v;
    update public.sales_lead_workspaces set proposal_status='declined',next_action='Review proposal and decide whether to revise or close',next_action_due_at=now()+interval '1 day',updated_at=now() where prospect_id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    values(v.prospect_id,'proposal_declined','sales_conversion','Proposal declined by recipient',jsonb_build_object('proposal_id',v.id,'version',v.version,'declined_by',trim(p_name)));
  end if;
  return jsonb_build_object('ok',true,'status',v.status,'proposal_id',v.id,'payment_token',case when v_payment.id is null then null else v_payment.token end,'payment_status',case when v_payment.id is null then null else v_payment.status end);
end;
$$;

revoke all on function public.sales_payment_public_get(uuid) from public;
grant execute on function public.sales_payment_public_get(uuid) to anon,authenticated;
revoke all on function public.sales_payment_admin_get(uuid) from public;
grant execute on function public.sales_payment_admin_get(uuid) to authenticated;
revoke all on function public.sales_payment_admin_mark_received(uuid,text,text,text) from public;
grant execute on function public.sales_payment_admin_mark_received(uuid,text,text,text) to authenticated;
revoke all on function public.sales_public_proposal_decide(uuid,text,text,text) from public;
grant execute on function public.sales_public_proposal_decide(uuid,text,text,text) to anon,authenticated;
