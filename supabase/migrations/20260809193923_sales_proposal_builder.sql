create table if not exists public.sales_proposals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ready','sent','viewed','accepted','declined','expired')),
  version integer not null default 1 check (version > 0),
  package_key text not null default 'standard' check (package_key in ('starter','standard','pro','custom')),
  package_name text not null default 'Standard',
  title text not null default 'Laboratory Website Proposal',
  summary_text text not null default '',
  scope_items jsonb not null default '[]'::jsonb,
  deliverable_items jsonb not null default '[]'::jsonb,
  process_items jsonb not null default '[]'::jsonb,
  timeline_label text not null default '10 days',
  price_amount numeric(12,2) not null default 450 check (price_amount >= 0),
  currency text not null default 'USD',
  deposit_percent numeric(5,2) not null default 25 check (deposit_percent >= 0 and deposit_percent <= 100),
  valid_until date not null default (current_date + 14),
  terms_text text not null default '',
  private_notes text not null default '',
  share_token uuid not null default gen_random_uuid() unique,
  share_enabled boolean not null default false,
  sent_at timestamptz null,
  first_viewed_at timestamptz null,
  last_viewed_at timestamptz null,
  view_count integer not null default 0 check (view_count >= 0),
  accepted_at timestamptz null,
  accepted_by_name text null,
  accepted_by_email text null,
  declined_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null
);

create index if not exists sales_proposals_prospect_idx on public.sales_proposals(prospect_id, created_at desc);
create index if not exists sales_proposals_site_idx on public.sales_proposals(site_id);
create unique index if not exists sales_proposals_one_current_per_prospect on public.sales_proposals(prospect_id);

create table if not exists public.sales_proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid null
);
create index if not exists sales_proposal_revisions_proposal_idx on public.sales_proposal_revisions(proposal_id, created_at desc);

alter table public.sales_proposals enable row level security;
alter table public.sales_proposal_revisions enable row level security;
revoke all on public.sales_proposals from anon, authenticated;
revoke all on public.sales_proposal_revisions from anon, authenticated;

drop function if exists public.sales_proposal_admin_get(uuid);
create function public.sales_proposal_admin_get(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
  v_workspace public.sales_lead_workspaces%rowtype;
  v_proposal public.sales_proposals%rowtype;
  v_summary text;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_prospect from public.prospects where id = p_prospect_id;
  if not found then raise exception 'Prospect not found'; end if;
  if v_prospect.site_id is not null then select * into v_site from public.sites where id = v_prospect.site_id; end if;

  insert into public.sales_lead_workspaces(prospect_id, stage, updated_by)
  values (p_prospect_id,
    case when v_site.outreach_status in ('replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing') then v_site.outreach_status
         when v_prospect.status='interested' then 'interested'
         when v_prospect.status='replied' then 'replied'
         else 'contacted' end,
    auth.uid())
  on conflict (prospect_id) do nothing;
  select * into v_workspace from public.sales_lead_workspaces where prospect_id=p_prospect_id;

  select * into v_proposal from public.sales_proposals where prospect_id=p_prospect_id limit 1;
  if not found then
    v_summary := format('This proposal covers the refinement and delivery of the LabNarrative website concept prepared for %s. The goal is to turn the current concept into a polished, accurate and maintainable laboratory website that clearly presents the group''s research, people and scientific output.', v_prospect.pi_name);
    insert into public.sales_proposals(
      prospect_id, site_id, package_key, package_name, title, summary_text,
      scope_items, deliverable_items, process_items, timeline_label, price_amount, currency,
      deposit_percent, valid_until, terms_text, created_by, updated_by
    ) values (
      p_prospect_id, v_prospect.site_id, 'standard', 'Standard', 'Laboratory Website Proposal', v_summary,
      jsonb_build_array(
        'Review and refine the existing LabNarrative website concept',
        'Finalize the PI/lab overview, research programmes, publications, team, opportunities and contact content',
        'Replace or update approved portrait and website imagery',
        'Complete responsive, content and rendering quality assurance before final publication'
      ),
      jsonb_build_array(
        'Completed laboratory website based on the approved concept',
        'Responsive desktop and mobile presentation',
        'Editable LabNarrative site with revision history',
        'Final deployment and handover after approval'
      ),
      jsonb_build_array(
        'A 25% deposit confirms the project and starts the agreed work',
        'Content and design revisions are completed and reviewed',
        'The final website is checked with the PI before handover',
        'The remaining balance is settled before final handover'
      ),
      '10 days', 450, 'USD', 25, current_date + 14,
      'Pricing covers the scope listed in this proposal. Material additions outside the agreed scope may require a revised proposal. Work begins after the deposit is received. Final timing depends on timely feedback and provision of any requested content or assets.',
      auth.uid(), auth.uid()
    ) returning * into v_proposal;
  end if;

  return jsonb_build_object(
    'proposal', to_jsonb(v_proposal),
    'prospect', to_jsonb(v_prospect),
    'site', case when v_site.id is null then null else to_jsonb(v_site) end,
    'workspace', to_jsonb(v_workspace),
    'revisions', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select * from public.sales_proposal_revisions where proposal_id=v_proposal.id order by created_at desc limit 20) r),'[]'::jsonb)
  );
end;
$$;

drop function if exists public.sales_proposal_admin_save(uuid,text,text,text,text,jsonb,jsonb,jsonb,text,numeric,text,numeric,date,text,text);
create function public.sales_proposal_admin_save(
  p_proposal_id uuid,
  p_package_key text,
  p_package_name text,
  p_title text,
  p_summary_text text,
  p_scope_items jsonb,
  p_deliverable_items jsonb,
  p_process_items jsonb,
  p_timeline_label text,
  p_price_amount numeric,
  p_currency text,
  p_deposit_percent numeric,
  p_valid_until date,
  p_terms_text text,
  p_private_notes text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_old public.sales_proposals%rowtype;
  v_new public.sales_proposals%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v_old from public.sales_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v_old.status in ('accepted','declined') then raise exception 'Accepted or declined proposals are locked. Create a new revision first.'; end if;
  if p_package_key not in ('starter','standard','pro','custom') then raise exception 'Invalid package'; end if;
  if coalesce(length(trim(p_package_name)),0)=0 or coalesce(length(trim(p_title)),0)=0 then raise exception 'Package name and title are required'; end if;
  if p_price_amount is null or p_price_amount < 0 then raise exception 'Invalid proposal amount'; end if;
  if p_deposit_percent is null or p_deposit_percent < 0 or p_deposit_percent > 100 then raise exception 'Invalid deposit percent'; end if;
  if p_valid_until is null then raise exception 'Proposal validity date is required'; end if;
  if jsonb_typeof(coalesce(p_scope_items,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_deliverable_items,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_process_items,'[]'::jsonb)) <> 'array' then raise exception 'Proposal list fields must be arrays'; end if;

  if v_old.status in ('sent','viewed') then
    insert into public.sales_proposal_revisions(proposal_id,version,snapshot,created_by)
    values(v_old.id,v_old.version,to_jsonb(v_old),auth.uid());
  end if;

  update public.sales_proposals set
    package_key=p_package_key,
    package_name=trim(p_package_name),
    title=trim(p_title),
    summary_text=coalesce(p_summary_text,''),
    scope_items=coalesce(p_scope_items,'[]'::jsonb),
    deliverable_items=coalesce(p_deliverable_items,'[]'::jsonb),
    process_items=coalesce(p_process_items,'[]'::jsonb),
    timeline_label=coalesce(trim(p_timeline_label),''),
    price_amount=p_price_amount,
    currency=upper(coalesce(nullif(trim(p_currency),''),'USD')),
    deposit_percent=p_deposit_percent,
    valid_until=p_valid_until,
    terms_text=coalesce(p_terms_text,''),
    private_notes=coalesce(p_private_notes,''),
    status=case when v_old.status in ('sent','viewed') then 'draft' else v_old.status end,
    version=case when v_old.status in ('sent','viewed') then v_old.version+1 else v_old.version end,
    share_enabled=case when v_old.status in ('sent','viewed') then false else v_old.share_enabled end,
    share_token=case when v_old.status in ('sent','viewed') then gen_random_uuid() else v_old.share_token end,
    sent_at=case when v_old.status in ('sent','viewed') then null else v_old.sent_at end,
    first_viewed_at=case when v_old.status in ('sent','viewed') then null else v_old.first_viewed_at end,
    last_viewed_at=case when v_old.status in ('sent','viewed') then null else v_old.last_viewed_at end,
    view_count=case when v_old.status in ('sent','viewed') then 0 else v_old.view_count end,
    updated_at=now(), updated_by=auth.uid()
  where id=p_proposal_id returning * into v_new;
  return to_jsonb(v_new);
end;
$$;

drop function if exists public.sales_proposal_admin_prepare_share(uuid);
create function public.sales_proposal_admin_prepare_share(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_proposals%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v.status in ('accepted','declined') then raise exception 'This proposal is already closed'; end if;
  if v.valid_until < current_date then raise exception 'Update the proposal validity date before sharing'; end if;
  if length(trim(v.summary_text)) < 20 then raise exception 'Proposal summary is too short'; end if;
  if jsonb_array_length(v.scope_items)=0 or jsonb_array_length(v.deliverable_items)=0 then raise exception 'Scope and deliverables are required'; end if;
  update public.sales_proposals set status='ready',share_enabled=true,updated_at=now(),updated_by=auth.uid() where id=p_proposal_id returning * into v;
  return to_jsonb(v);
end;
$$;

drop function if exists public.sales_proposal_admin_mark_sent(uuid);
create function public.sales_proposal_admin_mark_sent(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_proposals%rowtype;
  v_site_id uuid;
  v_deposit numeric;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v.status in ('accepted','declined') then raise exception 'This proposal is already closed'; end if;
  if not v.share_enabled then raise exception 'Prepare the share link first'; end if;
  if v.valid_until < current_date then raise exception 'Proposal has expired'; end if;
  v_deposit := round(v.price_amount * v.deposit_percent / 100.0,2);
  update public.sales_proposals set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now(),updated_by=auth.uid() where id=p_proposal_id returning * into v;

  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  insert into public.sales_lead_workspaces(prospect_id,stage,proposal_status,proposal_sent_at,proposal_amount,proposal_currency,deposit_percent,deposit_amount,next_action,next_action_due_at,updated_at,updated_by)
  values(v.prospect_id,'proposal_sent','sent',now(),v.price_amount,v.currency,v.deposit_percent,v_deposit,'Follow up on proposal',now()+interval '3 days',now(),auth.uid())
  on conflict(prospect_id) do update set
    stage='proposal_sent',proposal_status='sent',proposal_sent_at=now(),proposal_amount=v.price_amount,proposal_currency=v.currency,deposit_percent=v.deposit_percent,deposit_amount=v_deposit,next_action='Follow up on proposal',next_action_due_at=now()+interval '3 days',updated_at=now(),updated_by=auth.uid();
  if v_site_id is not null then update public.sites set outreach_status='proposal_sent',updated_at=now() where id=v_site_id; end if;
  update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(v.prospect_id,'proposal_sent','sales_conversion','Proposal marked as sent',jsonb_build_object('proposal_id',v.id,'version',v.version,'amount',v.price_amount,'currency',v.currency),auth.uid());
  return to_jsonb(v);
end;
$$;

drop function if exists public.sales_proposal_admin_revoke(uuid);
create function public.sales_proposal_admin_revoke(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_proposals%rowtype;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.sales_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v.status in ('accepted','declined') then raise exception 'Closed proposals cannot be revoked'; end if;
  update public.sales_proposals set share_enabled=false,status='draft',updated_at=now(),updated_by=auth.uid() where id=p_proposal_id returning * into v;
  return to_jsonb(v);
end;
$$;

drop function if exists public.sales_public_proposal_get(uuid);
create function public.sales_public_proposal_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.sales_proposals%rowtype;
  v_prospect public.prospects%rowtype;
  v_site public.sites%rowtype;
begin
  select * into v from public.sales_proposals where share_token=p_token and share_enabled=true for update;
  if not found then return jsonb_build_object('error','Proposal not found or link disabled'); end if;
  if v.valid_until < current_date and v.status not in ('accepted','declined') then
    update public.sales_proposals set status='expired',updated_at=now() where id=v.id returning * into v;
  end if;
  select * into v_prospect from public.prospects where id=v.prospect_id;
  if v.site_id is not null then select * into v_site from public.sites where id=v.site_id; end if;
  if v.status='sent' then
    update public.sales_proposals set status='viewed',first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  elsif v.status in ('ready','viewed') then
    update public.sales_proposals set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v.id returning * into v;
  end if;
  return jsonb_build_object(
    'proposal', jsonb_build_object(
      'id',v.id,'status',v.status,'version',v.version,'package_name',v.package_name,'title',v.title,'summary_text',v.summary_text,
      'scope_items',v.scope_items,'deliverable_items',v.deliverable_items,'process_items',v.process_items,'timeline_label',v.timeline_label,
      'price_amount',v.price_amount,'currency',v.currency,'deposit_percent',v.deposit_percent,'valid_until',v.valid_until,'terms_text',v.terms_text,
      'sent_at',v.sent_at,'accepted_at',v.accepted_at,'accepted_by_name',v.accepted_by_name,'declined_at',v.declined_at
    ),
    'prospect',jsonb_build_object('pi_name',v_prospect.pi_name,'institution',v_prospect.institution,'department',v_prospect.department,'email',v_prospect.email),
    'site',case when v_site.id is null then null else jsonb_build_object('slug',v_site.slug,'domain_url',v_site.domain_url,'content',jsonb_build_object('labName',v_site.content->>'labName','headline',v_site.content->>'headline')) end
  );
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
begin
  if p_decision not in ('accept','decline') then return jsonb_build_object('error','Invalid decision'); end if;
  if coalesce(length(trim(p_name)),0) < 2 then return jsonb_build_object('error','Please enter your name'); end if;
  select * into v from public.sales_proposals where share_token=p_token and share_enabled=true for update;
  if not found then return jsonb_build_object('error','Proposal not found or link disabled'); end if;
  if v.valid_until < current_date and v.status not in ('accepted','declined') then return jsonb_build_object('error','This proposal has expired'); end if;
  if v.status='accepted' then return jsonb_build_object('ok',true,'status','accepted'); end if;
  if v.status='declined' then return jsonb_build_object('ok',true,'status','declined'); end if;
  v_deposit := round(v.price_amount * v.deposit_percent / 100.0,2);
  select site_id into v_site_id from public.prospects where id=v.prospect_id;
  if p_decision='accept' then
    update public.sales_proposals set status='accepted',accepted_at=now(),accepted_by_name=trim(p_name),accepted_by_email=nullif(trim(coalesce(p_email,'')),''),updated_at=now() where id=v.id returning * into v;
    insert into public.sales_lead_workspaces(prospect_id,stage,proposal_status,proposal_amount,proposal_currency,deposit_percent,deposit_amount,next_action,next_action_due_at,updated_at)
    values(v.prospect_id,'proposal_sent','accepted',v.price_amount,v.currency,v.deposit_percent,v_deposit,'Send deposit payment link',now(),now())
    on conflict(prospect_id) do update set proposal_status='accepted',proposal_amount=v.price_amount,proposal_currency=v.currency,deposit_percent=v.deposit_percent,deposit_amount=v_deposit,next_action='Send deposit payment link',next_action_due_at=now(),updated_at=now();
    if v_site_id is not null then update public.sites set outreach_status='proposal_sent',updated_at=now() where id=v_site_id; end if;
    update public.prospects set status='interested',updated_at=now() where id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    values(v.prospect_id,'proposal_accepted','sales_conversion','Proposal approved by recipient',jsonb_build_object('proposal_id',v.id,'version',v.version,'accepted_by',trim(p_name)));
  else
    update public.sales_proposals set status='declined',declined_at=now(),updated_at=now() where id=v.id returning * into v;
    update public.sales_lead_workspaces set proposal_status='declined',next_action='Review proposal and decide whether to revise or close',next_action_due_at=now()+interval '1 day',updated_at=now() where prospect_id=v.prospect_id;
    insert into public.pipeline_events(prospect_id,event_type,step,message,payload)
    values(v.prospect_id,'proposal_declined','sales_conversion','Proposal declined by recipient',jsonb_build_object('proposal_id',v.id,'version',v.version,'declined_by',trim(p_name)));
  end if;
  return jsonb_build_object('ok',true,'status',v.status,'proposal_id',v.id);
end;
$$;

revoke all on function public.sales_proposal_admin_get(uuid) from public, anon;
revoke all on function public.sales_proposal_admin_save(uuid,text,text,text,text,jsonb,jsonb,jsonb,text,numeric,text,numeric,date,text,text) from public, anon;
revoke all on function public.sales_proposal_admin_prepare_share(uuid) from public, anon;
revoke all on function public.sales_proposal_admin_mark_sent(uuid) from public, anon;
revoke all on function public.sales_proposal_admin_revoke(uuid) from public, anon;
grant execute on function public.sales_proposal_admin_get(uuid) to authenticated;
grant execute on function public.sales_proposal_admin_save(uuid,text,text,text,text,jsonb,jsonb,jsonb,text,numeric,text,numeric,date,text,text) to authenticated;
grant execute on function public.sales_proposal_admin_prepare_share(uuid) to authenticated;
grant execute on function public.sales_proposal_admin_mark_sent(uuid) to authenticated;
grant execute on function public.sales_proposal_admin_revoke(uuid) to authenticated;

revoke all on function public.sales_public_proposal_get(uuid) from public;
revoke all on function public.sales_public_proposal_decide(uuid,text,text,text) from public;
grant execute on function public.sales_public_proposal_get(uuid) to anon, authenticated;
grant execute on function public.sales_public_proposal_decide(uuid,text,text,text) to anon, authenticated;
