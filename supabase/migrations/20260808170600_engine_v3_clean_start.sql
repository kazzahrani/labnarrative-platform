create schema if not exists labnarrative_engine_v3;

comment on schema labnarrative_engine_v3 is 'LabNarrative Engine v3: ChatGPT-native production orchestration. No OpenAI API worker.';

create table if not exists labnarrative_engine_v3.runtime (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  version integer not null default 3 check (version = 3),
  mode text not null default 'manual_test' check (mode in ('manual_test','scheduled_chatgpt','paused')),
  max_per_run integer not null default 4 check (max_per_run between 1 and 4),
  default_design_variant text not null default 'ciribilli-narita-v1',
  note text not null default '',
  updated_at timestamptz not null default now()
);

insert into labnarrative_engine_v3.runtime(singleton,enabled,version,mode,max_per_run,default_design_variant,note)
values(true,true,3,'manual_test',4,'ciribilli-narita-v1','Engine v3 initialized. ChatGPT is the reasoning engine; Supabase stores queue, evidence, assets and results. No autonomous OpenAI API worker.')
on conflict(singleton) do update set enabled=excluded.enabled,version=3,mode=excluded.mode,max_per_run=excluded.max_per_run,default_design_variant=excluded.default_design_variant,note=excluded.note,updated_at=now();

create table if not exists labnarrative_engine_v3.runs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  state text not null default 'producing' check (state in ('producing','final_review','published','completed','blocked','cancelled')),
  pi_name text not null,
  slug text not null,
  source text not null default 'chatgpt',
  batch_key text,
  blocked_reason text,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists engine_v3_one_active_run_per_prospect on labnarrative_engine_v3.runs(prospect_id) where state in ('producing','final_review','published');
create index if not exists engine_v3_runs_state_updated_idx on labnarrative_engine_v3.runs(state,updated_at desc);
create index if not exists engine_v3_runs_slug_idx on labnarrative_engine_v3.runs(slug);

create table if not exists labnarrative_engine_v3.events (
  id bigint generated always as identity primary key,
  run_id uuid not null references labnarrative_engine_v3.runs(id) on delete cascade,
  event_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists engine_v3_events_run_idx on labnarrative_engine_v3.events(run_id,created_at);

create table if not exists labnarrative_engine_v3.evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references labnarrative_engine_v3.runs(id) on delete cascade,
  evidence_type text not null,
  status text not null check (status in ('verified','unavailable','rejected')),
  source_url text,
  source_kind text not null default 'official',
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,evidence_type)
);

create table if not exists labnarrative_engine_v3.assets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references labnarrative_engine_v3.runs(id) on delete cascade,
  asset_role text not null,
  status text not null check (status in ('verified','unavailable','rejected')),
  asset_url text,
  source_url text,
  source_kind text not null default 'official',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,asset_role)
);

create table if not exists labnarrative_engine_v3.review (
  run_id uuid primary key references labnarrative_engine_v3.runs(id) on delete cascade,
  decision text not null check (decision in ('pending','approved','revision','rejected')),
  note text,
  actor_user_id uuid,
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function labnarrative_engine_v3.claim_next_queued_prospects(p_limit integer default 1, p_batch_key text default null)
returns table(run_id uuid,prospect_id uuid,pi_name text,slug text,institution text,department text,country text,official_profile_url text,email text,research_area text,qualification_score integer)
language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_enabled boolean; v_max integer; v_take integer; v_p public.prospects%rowtype; v_run uuid;
begin
  select enabled,max_per_run into v_enabled,v_max from labnarrative_engine_v3.runtime where singleton=true;
  if not coalesce(v_enabled,false) then raise exception 'engine_v3_disabled'; end if;
  v_take:=least(greatest(coalesce(p_limit,1),1),least(coalesce(v_max,4),4));
  for v_p in
    select p.* from public.prospects p
    where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>''
      and not exists(select 1 from public.sites s where s.slug=p.slug)
      and not exists(select 1 from labnarrative_engine_v3.runs r where r.prospect_id=p.id and r.state in ('producing','final_review','published'))
    order by p.queued_at asc nulls last,p.created_at asc,p.id asc
    for update skip locked limit v_take
  loop
    insert into labnarrative_engine_v3.runs(prospect_id,state,pi_name,slug,source,batch_key) values(v_p.id,'producing',v_p.pi_name,v_p.slug,'chatgpt',p_batch_key) returning id into v_run;
    update public.prospects set status='in_production',updated_at=now() where id=v_p.id;
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(v_run,'claimed','Queued prospect claimed by ChatGPT for Engine v3 production.',jsonb_build_object('batchKey',p_batch_key));
    run_id:=v_run; prospect_id:=v_p.id; pi_name:=v_p.pi_name; slug:=v_p.slug; institution:=v_p.institution; department:=v_p.department; country:=v_p.country; official_profile_url:=v_p.official_profile_url; email:=v_p.email; research_area:=v_p.research_area; qualification_score:=v_p.qualification_score; return next;
  end loop;
end; $$;

create or replace function labnarrative_engine_v3.attach_site(p_run_id uuid,p_site_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_run labnarrative_engine_v3.runs%rowtype; v_site public.sites%rowtype;
begin
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if;
  if v_run.state<>'producing' then raise exception 'run_not_producing:%',v_run.state; end if;
  select * into v_site from public.sites where id=p_site_id for update; if not found then raise exception 'site_not_found'; end if;
  if v_site.status<>'draft' then raise exception 'site_not_draft:%',v_site.status; end if;
  if v_site.slug<>v_run.slug then raise exception 'site_slug_mismatch:%:%',v_site.slug,v_run.slug; end if;
  update labnarrative_engine_v3.runs set site_id=p_site_id,updated_at=now() where id=p_run_id;
  update public.prospects set site_id=p_site_id,updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'site_attached','Draft site attached to Engine v3 run.',jsonb_build_object('siteId',p_site_id,'slug',v_site.slug));
  return jsonb_build_object('ok',true,'runId',p_run_id,'siteId',p_site_id,'slug',v_site.slug);
end; $$;

create or replace function labnarrative_engine_v3.finalize_for_review(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_run labnarrative_engine_v3.runs%rowtype; v_site public.sites%rowtype; v_portrait text; v_variant text; v_projects integer; v_research integer; v_publications integer; v_applied boolean;
begin
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if;
  if v_run.state<>'producing' then raise exception 'run_not_producing:%',v_run.state; end if;
  if v_run.site_id is null then raise exception 'draft_site_missing'; end if;
  select * into v_site from public.sites where id=v_run.site_id for update; if not found then raise exception 'draft_site_missing'; end if;
  if v_site.status<>'draft' then raise exception 'draft_site_not_private:%',v_site.status; end if; if v_site.slug<>v_run.slug then raise exception 'site_slug_mismatch'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='identity' and status='verified') then raise exception 'identity_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='official_profile' and status='verified') then raise exception 'official_profile_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='research' and status='verified') then raise exception 'research_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='publications' and status='verified') then raise exception 'publication_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='contact' and status in ('verified','unavailable')) then raise exception 'contact_evidence_missing'; end if;
  select asset_url into v_portrait from labnarrative_engine_v3.assets where run_id=p_run_id and asset_role='portrait' and status='verified' and coalesce(asset_url,'')<>''; if coalesce(v_portrait,'')='' then raise exception 'verified_portrait_required'; end if;
  v_projects:=case when jsonb_typeof(v_site.content->'projects')='array' then jsonb_array_length(v_site.content->'projects') else 0 end;
  v_research:=case when jsonb_typeof(v_site.content->'research')='array' then jsonb_array_length(v_site.content->'research') else 0 end;
  v_publications:=case when jsonb_typeof(v_site.content->'publications')='array' then jsonb_array_length(v_site.content->'publications') else 0 end;
  if v_projects<4 then raise exception 'four_projects_required:%',v_projects; end if; if v_research<4 then raise exception 'four_research_pages_required:%',v_research; end if; if v_publications<4 then raise exception 'four_verified_publications_required:%',v_publications; end if;
  if coalesce(v_site.content->>'piName','')='' or coalesce(v_site.content->>'labName','')='' or coalesce(v_site.content->>'headline','')='' or coalesce(v_site.content->>'introduction','')='' then raise exception 'required_site_copy_missing'; end if;
  v_variant:=coalesce(v_site.design_settings->>'variant',v_site.content->'design'->'settings'->>'variant',''); if v_variant<>'ciribilli-narita-v1' then raise exception 'narita_design_required:%',v_variant; end if;
  v_applied:=coalesce(v_site.content->'members'->0->>'image','')=v_portrait or coalesce(v_site.content->'pages'->'home'->>'piImage','')=v_portrait or coalesce(v_site.content->'pages'->'home'->>'topPortrait','')=v_portrait or coalesce(v_site.content->'pages'->'contact'->>'piImage','')=v_portrait;
  if not v_applied then raise exception 'verified_portrait_not_applied_to_site'; end if;
  update labnarrative_engine_v3.runs set state='final_review',updated_at=now(),summary=summary||jsonb_build_object('finalizedAt',now(),'portrait',v_portrait,'projects',v_projects,'research',v_research,'publications',v_publications) where id=p_run_id;
  update public.prospects set status='awaiting_final_review',updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.review(run_id,decision,updated_at) values(p_run_id,'pending',now()) on conflict(run_id) do update set decision='pending',note=null,actor_user_id=null,decided_at=null,updated_at=now();
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'final_review','Engine v3 production passed deterministic review gates.',jsonb_build_object('siteId',v_run.site_id,'portrait',v_portrait));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','final_review','siteId',v_run.site_id,'previewPath','/admin/preview/'||v_run.slug);
end; $$;

create or replace function labnarrative_engine_v3.block_run(p_run_id uuid,p_reason text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_run labnarrative_engine_v3.runs%rowtype;
begin
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if;
  if v_run.state not in ('producing','final_review') then raise exception 'run_not_blockable:%',v_run.state; end if;
  update labnarrative_engine_v3.runs set state='blocked',blocked_reason=left(coalesce(p_reason,'blocked'),1000),finished_at=now(),updated_at=now() where id=p_run_id;
  update public.prospects set status='needs_attention',updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'blocked',left(coalesce(p_reason,'blocked'),1000),coalesce(p_payload,'{}'::jsonb));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','blocked','reason',left(coalesce(p_reason,'blocked'),1000));
end; $$;

create or replace function public.engine_v3_admin_dashboard()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select jsonb_build_object(
    'runtime',(select to_jsonb(r) from labnarrative_engine_v3.runtime r where singleton=true),
    'counts',jsonb_build_object('eligibleQueue',(select count(*) from public.prospects p where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>'' and not exists(select 1 from public.sites s where s.slug=p.slug)),'producing',(select count(*) from labnarrative_engine_v3.runs where state='producing'),'finalReview',(select count(*) from labnarrative_engine_v3.runs where state='final_review'),'published',(select count(*) from labnarrative_engine_v3.runs where state='published'),'blocked',(select count(*) from labnarrative_engine_v3.runs where state='blocked'),'completed',(select count(*) from labnarrative_engine_v3.runs where state='completed')),
    'queue',coalesce((select jsonb_agg(jsonb_build_object('prospectId',p.id,'piName',p.pi_name,'slug',p.slug,'institution',p.institution,'score',p.qualification_score,'queuedAt',p.queued_at) order by p.queued_at asc nulls last,p.created_at asc) from public.prospects p where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>'' and not exists(select 1 from public.sites s where s.slug=p.slug)),'[]'::jsonb),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'prospectId',r.prospect_id,'siteId',r.site_id,'piName',r.pi_name,'slug',r.slug,'state',r.state,'blockedReason',r.blocked_reason,'startedAt',r.started_at,'updatedAt',r.updated_at,'previewPath',case when r.site_id is not null then '/admin/preview/'||r.slug else null end,'publicUrl',case when r.state in ('published','completed') then 'https://'||r.slug||'.labnarrative.com' else null end,'evidenceCount',(select count(*) from labnarrative_engine_v3.evidence e where e.run_id=r.id and e.status='verified'),'assetCount',(select count(*) from labnarrative_engine_v3.assets a where a.run_id=r.id and a.status='verified')) order by r.updated_at desc) from labnarrative_engine_v3.runs r where r.state<>'cancelled'),'[]'::jsonb)
  ) into v_result; return v_result;
end; $$;
grant execute on function public.engine_v3_admin_dashboard() to authenticated;

create or replace function public.engine_v3_admin_approve_publish(p_run_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_uid uuid:=auth.uid(); v_run labnarrative_engine_v3.runs%rowtype; v_site public.sites%rowtype; v_url text;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if; if v_run.state<>'final_review' then raise exception 'run_not_in_final_review:%',v_run.state; end if;
  if v_run.site_id is null then raise exception 'site_missing'; end if; select * into v_site from public.sites where id=v_run.site_id for update; if not found then raise exception 'site_missing'; end if; if v_site.status<>'draft' then raise exception 'site_not_private_draft:%',v_site.status; end if;
  v_url:='https://'||v_site.slug||'.labnarrative.com';
  insert into labnarrative_engine_v3.review(run_id,decision,note,actor_user_id,decided_at,updated_at) values(p_run_id,'approved',p_note,v_uid,now(),now()) on conflict(run_id) do update set decision='approved',note=excluded.note,actor_user_id=v_uid,decided_at=now(),updated_at=now();
  update public.sites set status='concept',domain_status='live',domain_url=v_url,domain_error=null,domain_connected_at=coalesce(domain_connected_at,now()),domain_checked_at=now(),updated_at=now() where id=v_run.site_id;
  update labnarrative_engine_v3.runs set state='published',finished_at=now(),updated_at=now(),summary=summary||jsonb_build_object('publishedAt',now(),'publicUrl',v_url) where id=p_run_id;
  update public.prospects set status='approved_to_send',site_id=v_run.site_id,updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'published','Human-approved Engine v3 concept published. Outreach was not sent.',jsonb_build_object('siteId',v_run.site_id,'publicUrl',v_url,'actorUserId',v_uid));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','published','siteId',v_run.site_id,'publicUrl',v_url,'outreachSent',false);
end; $$;
grant execute on function public.engine_v3_admin_approve_publish(uuid,text) to authenticated;

create or replace function public.engine_v3_admin_return_to_production(p_run_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,labnarrative_engine_v3 as $$
declare v_uid uuid:=auth.uid(); v_run labnarrative_engine_v3.runs%rowtype;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update; if not found then raise exception 'run_not_found'; end if; if v_run.state<>'final_review' then raise exception 'run_not_in_final_review:%',v_run.state; end if;
  insert into labnarrative_engine_v3.review(run_id,decision,note,actor_user_id,decided_at,updated_at) values(p_run_id,'revision',p_note,v_uid,now(),now()) on conflict(run_id) do update set decision='revision',note=excluded.note,actor_user_id=v_uid,decided_at=now(),updated_at=now();
  update labnarrative_engine_v3.runs set state='producing',finished_at=null,updated_at=now() where id=p_run_id; update public.prospects set status='in_production',updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(p_run_id,'revision_requested','Human review returned the concept to ChatGPT production.',jsonb_build_object('note',p_note,'actorUserId',v_uid));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','producing');
end; $$;
grant execute on function public.engine_v3_admin_return_to_production(uuid,text) to authenticated;

update labnarrative_engine.runtime set enabled=false,note='RETIRED: Engine v2 is historical only. Its autonomous pump was unscheduled during Engine v3 cutover. Do not resume v2 production.',updated_at=now() where singleton=true;
