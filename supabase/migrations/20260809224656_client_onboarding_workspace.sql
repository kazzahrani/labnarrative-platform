create table if not exists public.sales_client_onboarding (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references public.prospects(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  payment_id uuid not null unique references public.sales_payment_requests(id) on delete restrict,
  proposal_id uuid null references public.sales_proposals(id) on delete set null,
  share_token uuid not null default gen_random_uuid() unique,
  link_enabled boolean not null default true,
  status text not null default 'not_started' check (status in ('not_started','in_progress','submitted','reviewing','changes_requested','approved','completed')),
  lab_name text not null default '',
  preferred_title text not null default '',
  pi_bio text not null default '',
  homepage_changes text not null default '',
  research_changes text not null default '',
  publication_changes text not null default '',
  general_changes text not null default '',
  team_members jsonb not null default '[]'::jsonb,
  contact_email text not null default '',
  contact_phone text not null default '',
  contact_address text not null default '',
  official_profile_url text not null default '',
  linkedin_url text not null default '',
  x_url text not null default '',
  other_links jsonb not null default '[]'::jsonb,
  domain_choice text not null default 'undecided' check (domain_choice in ('labnarrative','custom','institutional','undecided')),
  preferred_domain text not null default '',
  domain_notes text not null default '',
  logo_url text not null default '',
  brand_colors text not null default '',
  branding_notes text not null default '',
  hiring_status text not null default 'none' check (hiring_status in ('none','opening','considering')),
  hiring_items jsonb not null default '[]'::jsonb,
  final_notes text not null default '',
  identity_reviewed boolean not null default false,
  content_reviewed boolean not null default false,
  team_reviewed boolean not null default false,
  contact_reviewed boolean not null default false,
  domain_reviewed boolean not null default false,
  branding_reviewed boolean not null default false,
  hiring_reviewed boolean not null default false,
  opened_at timestamptz null,
  last_saved_at timestamptz null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  approved_at timestamptz null,
  completed_at timestamptz null,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create table if not exists public.sales_client_onboarding_assets (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.sales_client_onboarding(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  kind text not null check (kind in ('logo','portrait','team_photo','lab_photo','research_image','other')),
  label text not null default '',
  storage_path text not null unique,
  public_url text not null,
  original_filename text not null default '',
  mime_type text not null default '',
  file_size bigint null check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists sales_client_onboarding_status_idx on public.sales_client_onboarding(status, updated_at desc);
create index if not exists sales_client_onboarding_assets_onboarding_idx on public.sales_client_onboarding_assets(onboarding_id, created_at desc);

alter table public.sales_client_onboarding enable row level security;
alter table public.sales_client_onboarding_assets enable row level security;
revoke all on public.sales_client_onboarding from anon, authenticated;
revoke all on public.sales_client_onboarding_assets from anon, authenticated;

create or replace function public.sales_ensure_client_onboarding(p_payment_id uuid)
returns public.sales_client_onboarding
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.sales_payment_requests%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_proposal public.sales_proposals%rowtype;
  v public.sales_client_onboarding%rowtype;
  v_members jsonb := '[]'::jsonb;
begin
  select * into v_payment from public.sales_payment_requests where id=p_payment_id;
  if not found then raise exception 'Payment request not found'; end if;
  if v_payment.status <> 'paid' then raise exception 'Client onboarding requires a paid deposit'; end if;
  select * into v_prospect from public.prospects where id=v_payment.prospect_id;
  if v_payment.site_id is not null then select * into v_site from public.sites where id=v_payment.site_id; end if;
  select * into v_proposal from public.sales_proposals where id=v_payment.proposal_id;
  if v_site.id is not null and jsonb_typeof(v_site.content->'members')='array' then v_members := v_site.content->'members'; end if;

  insert into public.sales_client_onboarding(
    prospect_id,site_id,payment_id,proposal_id,lab_name,preferred_title,team_members,contact_email,official_profile_url,created_at,updated_at
  ) values(
    v_payment.prospect_id,v_payment.site_id,v_payment.id,v_payment.proposal_id,
    coalesce(v_site.content->>'labName',''),coalesce(v_site.content->>'title',''),v_members,
    coalesce(v_prospect.email,''),coalesce(v_prospect.official_profile_url,''),now(),now()
  )
  on conflict(prospect_id) do update set
    payment_id=excluded.payment_id,
    proposal_id=excluded.proposal_id,
    site_id=coalesce(excluded.site_id,public.sales_client_onboarding.site_id),
    link_enabled=true,
    updated_at=now()
  returning * into v;

  return v;
end;
$$;

create or replace function public.sales_client_onboarding_public_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_client_onboarding%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_payment public.sales_payment_requests%rowtype;
  v_assets jsonb := '[]'::jsonb;
  v_progress integer;
begin
  select * into v from public.sales_client_onboarding where share_token=p_token and link_enabled=true for update;
  if not found then return jsonb_build_object('error','Onboarding link not found or disabled'); end if;
  if v.status='completed' then null;
  elsif v.status='not_started' then
    update public.sales_client_onboarding set status='in_progress',opened_at=coalesce(opened_at,now()),updated_at=now() where id=v.id returning * into v;
  elsif v.opened_at is null then
    update public.sales_client_onboarding set opened_at=now(),updated_at=now() where id=v.id returning * into v;
  end if;

  select * into v_prospect from public.prospects where id=v.prospect_id;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;
  select * into v_payment from public.sales_payment_requests where id=v.payment_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'kind',a.kind,'label',a.label,'public_url',a.public_url,'original_filename',a.original_filename,'mime_type',a.mime_type,'file_size',a.file_size,'created_at',a.created_at
  ) order by a.created_at desc),'[]'::jsonb) into v_assets
  from public.sales_client_onboarding_assets a where a.onboarding_id=v.id;
  v_progress := round((
    (case when v.identity_reviewed then 1 else 0 end)+
    (case when v.content_reviewed then 1 else 0 end)+
    (case when v.team_reviewed then 1 else 0 end)+
    (case when v.contact_reviewed then 1 else 0 end)+
    (case when v.domain_reviewed then 1 else 0 end)+
    (case when v.branding_reviewed then 1 else 0 end)+
    (case when v.hiring_reviewed then 1 else 0 end)
  ) * 100.0 / 7.0);

  return jsonb_build_object(
    'onboarding',to_jsonb(v)-'share_token'-'admin_notes'-'updated_by',
    'progress',v_progress,
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department),
    'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'status',v_site.status,'headline',v_site.content->>'headline','introduction',v_site.content->>'introduction') end,
    'payment',jsonb_build_object('amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at),
    'assets',v_assets
  );
end;
$$;

create or replace function public.sales_client_onboarding_public_save(p_token uuid,p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_client_onboarding%rowtype;
  v_team jsonb;
  v_links jsonb;
  v_hiring jsonb;
  v_domain text;
  v_hiring_status text;
begin
  select * into v from public.sales_client_onboarding where share_token=p_token and link_enabled=true for update;
  if not found then return jsonb_build_object('error','Onboarding link not found or disabled'); end if;
  if v.status='completed' then return jsonb_build_object('error','This onboarding record is complete and read-only'); end if;

  v_team := coalesce(p_payload->'team_members',v.team_members);
  v_links := coalesce(p_payload->'other_links',v.other_links);
  v_hiring := coalesce(p_payload->'hiring_items',v.hiring_items);
  if jsonb_typeof(v_team) <> 'array' or jsonb_array_length(v_team)>100 then return jsonb_build_object('error','Team data is invalid'); end if;
  if jsonb_typeof(v_links) <> 'array' or jsonb_array_length(v_links)>30 then return jsonb_build_object('error','Links data is invalid'); end if;
  if jsonb_typeof(v_hiring) <> 'array' or jsonb_array_length(v_hiring)>30 then return jsonb_build_object('error','Hiring data is invalid'); end if;
  v_domain := coalesce(nullif(p_payload->>'domain_choice',''),v.domain_choice);
  if v_domain not in ('labnarrative','custom','institutional','undecided') then v_domain := 'undecided'; end if;
  v_hiring_status := coalesce(nullif(p_payload->>'hiring_status',''),v.hiring_status);
  if v_hiring_status not in ('none','opening','considering') then v_hiring_status := 'none'; end if;

  update public.sales_client_onboarding set
    lab_name=left(coalesce(p_payload->>'lab_name',lab_name),300),
    preferred_title=left(coalesce(p_payload->>'preferred_title',preferred_title),300),
    pi_bio=left(coalesce(p_payload->>'pi_bio',pi_bio),6000),
    homepage_changes=left(coalesce(p_payload->>'homepage_changes',homepage_changes),8000),
    research_changes=left(coalesce(p_payload->>'research_changes',research_changes),12000),
    publication_changes=left(coalesce(p_payload->>'publication_changes',publication_changes),12000),
    general_changes=left(coalesce(p_payload->>'general_changes',general_changes),12000),
    team_members=v_team,
    contact_email=left(coalesce(p_payload->>'contact_email',contact_email),320),
    contact_phone=left(coalesce(p_payload->>'contact_phone',contact_phone),100),
    contact_address=left(coalesce(p_payload->>'contact_address',contact_address),1000),
    official_profile_url=left(coalesce(p_payload->>'official_profile_url',official_profile_url),2000),
    linkedin_url=left(coalesce(p_payload->>'linkedin_url',linkedin_url),2000),
    x_url=left(coalesce(p_payload->>'x_url',x_url),2000),
    other_links=v_links,
    domain_choice=v_domain,
    preferred_domain=left(coalesce(p_payload->>'preferred_domain',preferred_domain),500),
    domain_notes=left(coalesce(p_payload->>'domain_notes',domain_notes),3000),
    logo_url=left(coalesce(p_payload->>'logo_url',logo_url),3000),
    brand_colors=left(coalesce(p_payload->>'brand_colors',brand_colors),1000),
    branding_notes=left(coalesce(p_payload->>'branding_notes',branding_notes),5000),
    hiring_status=v_hiring_status,
    hiring_items=v_hiring,
    final_notes=left(coalesce(p_payload->>'final_notes',final_notes),8000),
    identity_reviewed=coalesce((p_payload->>'identity_reviewed')::boolean,identity_reviewed),
    content_reviewed=coalesce((p_payload->>'content_reviewed')::boolean,content_reviewed),
    team_reviewed=coalesce((p_payload->>'team_reviewed')::boolean,team_reviewed),
    contact_reviewed=coalesce((p_payload->>'contact_reviewed')::boolean,contact_reviewed),
    domain_reviewed=coalesce((p_payload->>'domain_reviewed')::boolean,domain_reviewed),
    branding_reviewed=coalesce((p_payload->>'branding_reviewed')::boolean,branding_reviewed),
    hiring_reviewed=coalesce((p_payload->>'hiring_reviewed')::boolean,hiring_reviewed),
    status=case when status in ('submitted','reviewing','changes_requested','approved') then 'in_progress' else status end,
    last_saved_at=now(),updated_at=now()
  where id=v.id returning * into v;
  return jsonb_build_object('ok',true,'status',v.status,'updated_at',v.updated_at);
exception when invalid_text_representation then
  return jsonb_build_object('error','One or more onboarding values were invalid');
end;
$$;

create or replace function public.sales_client_onboarding_public_submit(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_client_onboarding%rowtype;
  v_progress integer;
begin
  select * into v from public.sales_client_onboarding where share_token=p_token and link_enabled=true for update;
  if not found then return jsonb_build_object('error','Onboarding link not found or disabled'); end if;
  if v.status='completed' then return jsonb_build_object('error','This onboarding record is already complete'); end if;
  v_progress := round(((case when v.identity_reviewed then 1 else 0 end)+(case when v.content_reviewed then 1 else 0 end)+(case when v.team_reviewed then 1 else 0 end)+(case when v.contact_reviewed then 1 else 0 end)+(case when v.domain_reviewed then 1 else 0 end)+(case when v.branding_reviewed then 1 else 0 end)+(case when v.hiring_reviewed then 1 else 0 end))*100.0/7.0);
  if v_progress < 100 then return jsonb_build_object('error','Please review all seven onboarding sections before submitting','progress',v_progress); end if;
  update public.sales_client_onboarding set status='submitted',submitted_at=now(),last_saved_at=coalesce(last_saved_at,now()),updated_at=now() where id=v.id returning * into v;
  update public.sales_lead_workspaces set next_action='Review client onboarding submission',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
  values(v.prospect_id,'client_onboarding_submitted','client_onboarding','Client submitted onboarding information',jsonb_build_object('onboarding_id',v.id,'progress',100));
  return jsonb_build_object('ok',true,'status','submitted','submitted_at',v.submitted_at);
end;
$$;

create or replace function public.sales_client_onboarding_admin_get(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_client_onboarding%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_payment public.sales_payment_requests%rowtype;
  v_assets jsonb := '[]'::jsonb;
  v_progress integer := 0;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_prospect from public.prospects where id=p_prospect_id;
  if not found then raise exception 'Prospect not found'; end if;
  select * into v from public.sales_client_onboarding where prospect_id=p_prospect_id;
  if not found then
    return jsonb_build_object('prospect',jsonb_build_object('id',v_prospect.id,'pi_name',v_prospect.pi_name,'institution',v_prospect.institution),'onboarding',null,'assets','[]'::jsonb);
  end if;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;
  select * into v_payment from public.sales_payment_requests where id=v.payment_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_assets from public.sales_client_onboarding_assets a where a.onboarding_id=v.id;
  v_progress := round(((case when v.identity_reviewed then 1 else 0 end)+(case when v.content_reviewed then 1 else 0 end)+(case when v.team_reviewed then 1 else 0 end)+(case when v.contact_reviewed then 1 else 0 end)+(case when v.domain_reviewed then 1 else 0 end)+(case when v.branding_reviewed then 1 else 0 end)+(case when v.hiring_reviewed then 1 else 0 end))*100.0/7.0);
  return jsonb_build_object(
    'prospect',jsonb_build_object('id',v_prospect.id,'pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department,'email',v_prospect.email),
    'site',case when v_site.id is null then null else jsonb_build_object('id',v_site.id,'slug',v_site.slug,'domain_url',v_site.domain_url,'status',v_site.status) end,
    'payment',jsonb_build_object('id',v_payment.id,'amount',v_payment.amount,'currency',v_payment.currency,'paid_at',v_payment.paid_at),
    'onboarding',to_jsonb(v),
    'progress',v_progress,
    'assets',v_assets
  );
end;
$$;

create or replace function public.sales_client_onboarding_admin_status(p_prospect_id uuid,p_status text,p_admin_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_client_onboarding%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('reviewing','changes_requested','approved','completed') then raise exception 'Invalid onboarding status'; end if;
  update public.sales_client_onboarding set
    status=p_status,
    admin_notes=case when p_admin_notes is null then admin_notes else left(p_admin_notes,8000) end,
    reviewed_at=case when p_status in ('reviewing','changes_requested','approved','completed') then coalesce(reviewed_at,now()) else reviewed_at end,
    approved_at=case when p_status in ('approved','completed') then coalesce(approved_at,now()) else approved_at end,
    completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
    updated_at=now(),updated_by=auth.uid()
  where prospect_id=p_prospect_id returning * into v;
  if not found then raise exception 'Client onboarding not found'; end if;
  update public.sales_lead_workspaces set
    next_action=case when p_status='changes_requested' then 'Wait for client onboarding revisions' when p_status='approved' then 'Apply approved onboarding changes to website' when p_status='completed' then 'Finalize website and remaining balance' else 'Review client onboarding submission' end,
    next_action_due_at=case when p_status in ('changes_requested') then null else now() end,
    updated_at=now(),updated_by=auth.uid()
  where prospect_id=p_prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(v.prospect_id,'client_onboarding_'||p_status,'client_onboarding','Client onboarding status changed to '||p_status,jsonb_build_object('onboarding_id',v.id),auth.uid());
  return jsonb_build_object('ok',true,'status',v.status,'updated_at',v.updated_at);
end;
$$;

create or replace function public.sales_client_onboarding_admin_regenerate_link(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_client_onboarding%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  update public.sales_client_onboarding set share_token=gen_random_uuid(),link_enabled=true,updated_at=now(),updated_by=auth.uid() where prospect_id=p_prospect_id returning * into v;
  if not found then raise exception 'Client onboarding not found'; end if;
  return jsonb_build_object('ok',true,'share_token',v.share_token);
end;
$$;

create or replace function public.sales_payment_provider_complete(
  p_payment_id uuid,p_order_id text,p_capture_id text,p_capture_status text,p_capture_amount numeric,p_capture_currency text,p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v public.sales_payment_requests%rowtype; v_site_id uuid; v_payer_name text; v_payer_email text; v_onboarding public.sales_client_onboarding%rowtype;
begin
  select * into v from public.sales_payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then
    select * into v_onboarding from public.sales_client_onboarding where payment_id=v.id;
    if not found then perform public.sales_ensure_client_onboarding(v.id); end if;
    return to_jsonb(v);
  end if;
  if v.status in ('cancelled','expired','refunded') then raise exception 'Payment request is closed'; end if;
  if coalesce(v.provider_order_id,'') <> coalesce(trim(p_order_id),'') then raise exception 'Provider order does not match this payment request'; end if;
  if upper(coalesce(trim(p_capture_status),'')) <> 'COMPLETED' then raise exception 'Provider capture is not completed'; end if;
  if p_capture_amount is null or round(p_capture_amount,2) <> round(v.amount,2) then raise exception 'Captured amount does not match the requested amount'; end if;
  if upper(coalesce(trim(p_capture_currency),'')) <> upper(v.currency) then raise exception 'Captured currency does not match the requested currency'; end if;
  if coalesce(length(trim(p_capture_id)),0)=0 then raise exception 'Provider capture ID is required'; end if;
  v_payer_name := nullif(trim(coalesce(p_metadata#>>'{payer,name}','')),''); v_payer_email := nullif(trim(coalesce(p_metadata#>>'{payer,email}','')),'');
  update public.sales_payment_requests set status='paid',provider_capture_id=trim(p_capture_id),paid_at=now(),payer_name=coalesce(v_payer_name,payer_name),payer_email=coalesce(v_payer_email,payer_email),provider_metadata=provider_metadata||coalesce(p_metadata,'{}'::jsonb),failure_message=null,failed_at=null,updated_at=now() where id=v.id returning * into v;
  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  update public.sales_lead_workspaces set stage='client',payment_status='deposit_received',deposit_amount=v.amount,deposit_percent=v.deposit_percent,deposit_received_at=now(),next_action='Send client onboarding link',next_action_due_at=now(),updated_at=now() where prospect_id=v.prospect_id;
  if v_site_id is not null then update public.sites set outreach_status='client',updated_at=now() where id=v_site_id; end if;
  update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
  select * into v_onboarding from public.sales_ensure_client_onboarding(v.id);
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload) values(v.prospect_id,'deposit_received','sales_conversion','Deposit payment captured successfully; onboarding opened',jsonb_build_object('payment_id',v.id,'proposal_id',v.proposal_id,'amount',v.amount,'currency',v.currency,'provider',v.provider,'provider_order_id',p_order_id,'provider_capture_id',p_capture_id,'onboarding_id',v_onboarding.id));
  return to_jsonb(v);
end;
$$;

create or replace function public.sales_payment_admin_mark_received(p_payment_id uuid,p_reference text default null,p_payer_name text default null,p_payer_email text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.sales_payment_requests%rowtype; v_site_id uuid; v_onboarding public.sales_client_onboarding%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_payment_requests where id=p_payment_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if v.status='paid' then
    select * into v_onboarding from public.sales_client_onboarding where payment_id=v.id;
    if not found then perform public.sales_ensure_client_onboarding(v.id); end if;
    return to_jsonb(v);
  end if;
  if v.status in ('cancelled','expired','refunded') then raise exception 'This payment request is not payable'; end if;
  update public.sales_payment_requests set status='paid',paid_at=now(),updated_at=now(),updated_by=auth.uid(),provider_capture_id=coalesce(nullif(trim(p_reference),''),provider_capture_id),payer_name=coalesce(nullif(trim(p_payer_name),''),payer_name),payer_email=coalesce(nullif(trim(p_payer_email),''),payer_email),provider_metadata=provider_metadata||jsonb_build_object('manual_confirmation',true,'confirmed_by',auth.uid()) where id=v.id returning * into v;
  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  update public.sales_lead_workspaces set stage='client',payment_status='deposit_received',deposit_amount=v.amount,deposit_percent=v.deposit_percent,deposit_received_at=now(),next_action='Send client onboarding link',next_action_due_at=now(),updated_at=now(),updated_by=auth.uid() where prospect_id=v.prospect_id;
  if v_site_id is not null then update public.sites set outreach_status='client',updated_at=now() where id=v_site_id; end if;
  update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
  select * into v_onboarding from public.sales_ensure_client_onboarding(v.id);
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by) values(v.prospect_id,'deposit_received','sales_conversion','Deposit payment manually confirmed; onboarding opened',jsonb_build_object('payment_id',v.id,'amount',v.amount,'currency',v.currency,'reference',p_reference,'onboarding_id',v_onboarding.id),auth.uid());
  return to_jsonb(v);
end;
$$;

revoke all on function public.sales_ensure_client_onboarding(uuid) from public,anon,authenticated;
grant execute on function public.sales_ensure_client_onboarding(uuid) to service_role;
revoke all on function public.sales_client_onboarding_public_get(uuid) from public;
grant execute on function public.sales_client_onboarding_public_get(uuid) to anon,authenticated;
revoke all on function public.sales_client_onboarding_public_save(uuid,jsonb) from public;
grant execute on function public.sales_client_onboarding_public_save(uuid,jsonb) to anon,authenticated;
revoke all on function public.sales_client_onboarding_public_submit(uuid) from public;
grant execute on function public.sales_client_onboarding_public_submit(uuid) to anon,authenticated;
revoke all on function public.sales_client_onboarding_admin_get(uuid) from public,anon;
grant execute on function public.sales_client_onboarding_admin_get(uuid) to authenticated,service_role;
revoke all on function public.sales_client_onboarding_admin_status(uuid,text,text) from public,anon;
grant execute on function public.sales_client_onboarding_admin_status(uuid,text,text) to authenticated,service_role;
revoke all on function public.sales_client_onboarding_admin_regenerate_link(uuid) from public,anon;
grant execute on function public.sales_client_onboarding_admin_regenerate_link(uuid) to authenticated,service_role;
revoke all on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_payment_provider_complete(uuid,text,text,text,numeric,text,jsonb) to service_role;
revoke all on function public.sales_payment_admin_mark_received(uuid,text,text,text) from public,anon;
grant execute on function public.sales_payment_admin_mark_received(uuid,text,text,text) to authenticated,service_role;
