alter table labnarrative_engine_v3.runtime
  add column if not exists stale_after_minutes integer not null default 45;

alter table labnarrative_engine_v3.runs
  add column if not exists checkpoint_stage text,
  add column if not exists checkpoint_at timestamptz,
  add column if not exists resume_count integer;

update labnarrative_engine_v3.runs r
set checkpoint_stage = case
      when r.state in ('final_review','published','completed') then 'final_review'
      when exists (
        select 1 from labnarrative_engine_v3.assets a
        where a.run_id=r.id and a.asset_role='portrait' and a.status='verified'
          and coalesce(a.metadata->>'portrait_gate','')='passed'
          and coalesce((a.metadata->>'identity_verified')::boolean,false)
          and coalesce((a.metadata->>'source_verified')::boolean,false)
          and coalesce((a.metadata->>'quality_verified')::boolean,false)
          and coalesce((a.metadata->>'render_verified')::boolean,false)
      ) then 'portrait_verified'
      when r.site_id is not null then 'site_attached'
      when exists (
        select 1 from labnarrative_engine_v3.evidence e
        where e.run_id=r.id and e.evidence_type='research' and e.status='verified'
      ) then 'research_persisted'
      else 'claimed'
    end,
    checkpoint_at = coalesce(r.checkpoint_at,r.updated_at,r.started_at,r.created_at),
    resume_count = coalesce(r.resume_count,0);

alter table labnarrative_engine_v3.runs
  alter column checkpoint_stage set default 'claimed',
  alter column checkpoint_stage set not null,
  alter column checkpoint_at set default now(),
  alter column checkpoint_at set not null,
  alter column resume_count set default 0,
  alter column resume_count set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='engine_v3_runtime_stale_after_minutes_check'
  ) then
    alter table labnarrative_engine_v3.runtime
      add constraint engine_v3_runtime_stale_after_minutes_check
      check (stale_after_minutes between 15 and 720);
  end if;
  if not exists (
    select 1 from pg_constraint where conname='engine_v3_runs_checkpoint_stage_check'
  ) then
    alter table labnarrative_engine_v3.runs
      add constraint engine_v3_runs_checkpoint_stage_check
      check (checkpoint_stage in ('claimed','research_persisted','site_attached','portrait_recovery','portrait_verified','renderer_verified','final_review'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname='engine_v3_runs_resume_count_check'
  ) then
    alter table labnarrative_engine_v3.runs
      add constraint engine_v3_runs_resume_count_check
      check (resume_count >= 0);
  end if;
end $$;

update labnarrative_engine_v3.runtime
set mode='scheduled_chatgpt',
    max_per_run=3,
    stale_after_minutes=45,
    note='Engine v3 uses resume-first, PI-by-PI checkpointed ChatGPT production. Evidence is persisted before site attachment; portrait recovery and renderer verification are durable checkpoints. Routine Production must not deploy infrastructure.',
    updated_at=now()
where singleton=true;

update labnarrative_engine_v3.runs
set summary = summary || jsonb_build_object(
  'checkpointStage',checkpoint_stage,
  'checkpointAt',checkpoint_at,
  'resumeCount',resume_count
);

insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
select r.id,
       'interrupted_detected',
       'Engine v3 detected a stale producing run. It will be resumed before new queue work is claimed.',
       jsonb_build_object('checkpointStage',r.checkpoint_stage,'previousBatchKey',r.batch_key,'staleAfterMinutes',rt.stale_after_minutes)
from labnarrative_engine_v3.runs r
cross join labnarrative_engine_v3.runtime rt
where rt.singleton=true
  and r.state='producing'
  and r.checkpoint_at < now() - make_interval(mins=>rt.stale_after_minutes)
  and not exists (
    select 1 from labnarrative_engine_v3.events e
    where e.run_id=r.id and e.event_type='interrupted_detected'
  );

create or replace function labnarrative_engine_v3.checkpoint_run(
  p_run_id uuid,
  p_stage text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,labnarrative_engine_v3
as $$
declare
  v_run labnarrative_engine_v3.runs%rowtype;
  v_current_rank integer;
  v_new_rank integer;
  v_portrait_meta jsonb;
begin
  select * into v_run
  from labnarrative_engine_v3.runs
  where id=p_run_id
  for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.state<>'producing' then raise exception 'run_not_producing:%',v_run.state; end if;
  if p_stage not in ('claimed','research_persisted','site_attached','portrait_recovery','portrait_verified','renderer_verified') then
    raise exception 'invalid_checkpoint_stage:%',p_stage;
  end if;

  v_current_rank := case coalesce(v_run.checkpoint_stage,'claimed')
    when 'claimed' then 1 when 'research_persisted' then 2 when 'site_attached' then 3
    when 'portrait_recovery' then 4 when 'portrait_verified' then 5 when 'renderer_verified' then 6
    when 'final_review' then 7 else 0 end;
  v_new_rank := case p_stage
    when 'claimed' then 1 when 'research_persisted' then 2 when 'site_attached' then 3
    when 'portrait_recovery' then 4 when 'portrait_verified' then 5 when 'renderer_verified' then 6 else 0 end;
  if v_new_rank < v_current_rank then raise exception 'checkpoint_regression:%:%',v_run.checkpoint_stage,p_stage; end if;

  if p_stage='research_persisted' and not exists (
    select 1 from labnarrative_engine_v3.evidence e
    where e.run_id=p_run_id and e.evidence_type='research' and e.status='verified'
  ) then raise exception 'research_evidence_missing'; end if;

  if p_stage in ('site_attached','portrait_recovery','portrait_verified','renderer_verified') and v_run.site_id is null then
    raise exception 'draft_site_checkpoint_required';
  end if;

  if p_stage='portrait_verified' or p_stage='renderer_verified' then
    select coalesce(a.metadata,'{}'::jsonb) into v_portrait_meta
    from labnarrative_engine_v3.assets a
    where a.run_id=p_run_id and a.asset_role='portrait' and a.status='verified' and coalesce(a.asset_url,'')<>'';
    if v_portrait_meta is null then raise exception 'portrait_missing'; end if;
    if coalesce(v_portrait_meta->>'portrait_gate','')<>'passed'
       or not coalesce((v_portrait_meta->>'identity_verified')::boolean,false)
       or not coalesce((v_portrait_meta->>'source_verified')::boolean,false)
       or not coalesce((v_portrait_meta->>'quality_verified')::boolean,false)
       or not coalesce((v_portrait_meta->>'render_verified')::boolean,false)
    then raise exception 'portrait_not_fully_verified'; end if;
  end if;

  update labnarrative_engine_v3.runs
  set checkpoint_stage=p_stage,
      checkpoint_at=now(),
      updated_at=now(),
      summary=summary || jsonb_build_object('checkpointStage',p_stage,'checkpointAt',now(),'resumeCount',resume_count)
  where id=p_run_id;

  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
  values(
    p_run_id,
    'checkpoint',
    'Engine v3 production checkpoint persisted: '||p_stage||'.',
    jsonb_build_object('stage',p_stage) || coalesce(p_payload,'{}'::jsonb)
  );

  return jsonb_build_object('ok',true,'runId',p_run_id,'stage',p_stage,'checkpointAt',now());
end;
$$;

create or replace function labnarrative_engine_v3.claim_next_queued_prospects(
  p_limit integer default 1,
  p_batch_key text default null
)
returns table(
  run_id uuid, prospect_id uuid, pi_name text, slug text, institution text,
  department text, country text, official_profile_url text, email text,
  research_area text, qualification_score integer
)
language plpgsql
security definer
set search_path=pg_catalog,public,labnarrative_engine_v3
as $$
declare
  v_enabled boolean;
  v_max integer;
  v_stale_minutes integer;
  v_requested integer;
  v_fresh_active integer;
  v_capacity integer;
  v_returned integer := 0;
  v_p public.prospects%rowtype;
  v_r labnarrative_engine_v3.runs%rowtype;
  v_run uuid;
  v_old_batch text;
  v_resume_count integer;
begin
  select enabled,max_per_run,stale_after_minutes
    into v_enabled,v_max,v_stale_minutes
  from labnarrative_engine_v3.runtime
  where singleton=true;
  if not coalesce(v_enabled,false) then raise exception 'engine_v3_disabled'; end if;

  v_requested := least(greatest(coalesce(p_limit,1),1),least(coalesce(v_max,3),4));

  select count(*) into v_fresh_active
  from labnarrative_engine_v3.runs r
  where r.state='producing'
    and coalesce(r.checkpoint_at,r.updated_at,r.started_at) >= now() - make_interval(mins=>coalesce(v_stale_minutes,45));

  v_capacity := greatest(v_requested - least(v_fresh_active,v_requested),0);
  if v_capacity=0 then return; end if;

  for v_r in
    select r.*
    from labnarrative_engine_v3.runs r
    where r.state='producing'
      and coalesce(r.checkpoint_at,r.updated_at,r.started_at) < now() - make_interval(mins=>coalesce(v_stale_minutes,45))
    order by r.started_at asc,r.created_at asc,r.id asc
    for update skip locked
    limit v_capacity
  loop
    select p.* into v_p from public.prospects p where p.id=v_r.prospect_id;
    v_old_batch := v_r.batch_key;

    update labnarrative_engine_v3.runs
    set batch_key=coalesce(p_batch_key,batch_key),
        updated_at=now(),
        checkpoint_at=now(),
        resume_count=resume_count+1,
        summary=summary || jsonb_build_object('lastResumedAt',now(),'lastResumeBatchKey',p_batch_key,'previousBatchKey',v_old_batch,'checkpointStage',checkpoint_stage,'resumeCount',resume_count+1)
    where id=v_r.id
    returning resume_count into v_resume_count;

    update public.prospects
    set status='in_production',updated_at=now()
    where id=v_r.prospect_id;

    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(
      v_r.id,
      'resumed',
      'Stale Engine v3 producing run resumed before any new queue claim.',
      jsonb_build_object('previousBatchKey',v_old_batch,'batchKey',p_batch_key,'checkpointStage',v_r.checkpoint_stage,'resumeCount',v_resume_count)
    );

    run_id:=v_r.id;
    prospect_id:=v_r.prospect_id;
    pi_name:=v_r.pi_name;
    slug:=v_r.slug;
    institution:=v_p.institution;
    department:=v_p.department;
    country:=v_p.country;
    official_profile_url:=v_p.official_profile_url;
    email:=v_p.email;
    research_area:=v_p.research_area;
    qualification_score:=v_p.qualification_score;
    v_returned:=v_returned+1;
    return next;
  end loop;

  v_capacity := v_capacity - v_returned;
  if v_capacity<=0 then return; end if;

  for v_p in
    select p.*
    from public.prospects p
    where p.status='queued'
      and p.site_id is null
      and coalesce(trim(p.slug),'')<>''
      and not exists (select 1 from public.sites s where s.slug=p.slug)
      and not exists (
        select 1 from labnarrative_engine_v3.runs r
        where r.prospect_id=p.id and r.state in ('producing','final_review','published')
      )
    order by p.queued_at asc nulls last,p.created_at asc,p.id asc
    for update skip locked
    limit v_capacity
  loop
    insert into labnarrative_engine_v3.runs(
      prospect_id,state,pi_name,slug,source,batch_key,checkpoint_stage,checkpoint_at,resume_count,summary
    ) values(
      v_p.id,'producing',v_p.pi_name,v_p.slug,'chatgpt',p_batch_key,'claimed',now(),0,
      jsonb_build_object('checkpointStage','claimed','checkpointAt',now(),'resumeCount',0)
    ) returning id into v_run;

    update public.prospects
    set status='in_production',updated_at=now()
    where id=v_p.id;

    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(v_run,'claimed','Queued prospect claimed by ChatGPT for Engine v3 production.',jsonb_build_object('batchKey',p_batch_key,'checkpointStage','claimed'));

    run_id:=v_run;
    prospect_id:=v_p.id;
    pi_name:=v_p.pi_name;
    slug:=v_p.slug;
    institution:=v_p.institution;
    department:=v_p.department;
    country:=v_p.country;
    official_profile_url:=v_p.official_profile_url;
    email:=v_p.email;
    research_area:=v_p.research_area;
    qualification_score:=v_p.qualification_score;
    return next;
  end loop;
end;
$$;

create or replace function labnarrative_engine_v3.attach_site(p_run_id uuid,p_site_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,labnarrative_engine_v3
as $$
declare
  v_run labnarrative_engine_v3.runs%rowtype;
  v_site public.sites%rowtype;
begin
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.state<>'producing' then raise exception 'run_not_producing:%',v_run.state; end if;

  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='identity' and status='verified') then raise exception 'identity_evidence_missing_before_site'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='official_profile' and status='verified') then raise exception 'official_profile_evidence_missing_before_site'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='research' and status='verified') then raise exception 'research_evidence_missing_before_site'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='publications' and status='verified') then raise exception 'publication_evidence_missing_before_site'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='contact' and status in ('verified','unavailable')) then raise exception 'contact_evidence_missing_before_site'; end if;

  select * into v_site from public.sites where id=p_site_id for update;
  if not found then raise exception 'site_not_found'; end if;
  if v_site.status<>'draft' then raise exception 'site_not_draft:%',v_site.status; end if;
  if v_site.slug<>v_run.slug then raise exception 'site_slug_mismatch:%:%',v_site.slug,v_run.slug; end if;

  update labnarrative_engine_v3.runs
  set site_id=p_site_id,
      checkpoint_stage='site_attached',
      checkpoint_at=now(),
      updated_at=now(),
      summary=summary || jsonb_build_object('checkpointStage','site_attached','checkpointAt',now(),'siteId',p_site_id)
  where id=p_run_id;

  update public.prospects set site_id=p_site_id,updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
  values(p_run_id,'site_attached','Draft site attached after verified evidence was durably persisted.',jsonb_build_object('siteId',p_site_id,'slug',v_site.slug,'checkpointStage','site_attached'));
  return jsonb_build_object('ok',true,'runId',p_run_id,'siteId',p_site_id,'slug',v_site.slug,'checkpointStage','site_attached');
end;
$$;

create or replace function labnarrative_engine_v3.sync_state_checkpoint()
returns trigger
language plpgsql
set search_path=pg_catalog,public,labnarrative_engine_v3
as $$
begin
  if new.state='final_review' and old.state is distinct from new.state then
    new.checkpoint_stage:='final_review';
    new.checkpoint_at:=now();
    new.summary:=coalesce(new.summary,'{}'::jsonb) || jsonb_build_object('checkpointStage','final_review','checkpointAt',now());
  end if;
  return new;
end;
$$;

drop trigger if exists engine_v3_sync_state_checkpoint on labnarrative_engine_v3.runs;
create trigger engine_v3_sync_state_checkpoint
before update of state on labnarrative_engine_v3.runs
for each row execute function labnarrative_engine_v3.sync_state_checkpoint();

create or replace function public.engine_v3_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,labnarrative_engine_v3
as $$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
  v_stale integer;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select stale_after_minutes into v_stale from labnarrative_engine_v3.runtime where singleton=true;

  select jsonb_build_object(
    'runtime',(select to_jsonb(r) from labnarrative_engine_v3.runtime r where singleton=true),
    'counts',jsonb_build_object(
      'eligibleQueue',(select count(*) from public.prospects p where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>'' and not exists(select 1 from public.sites s where s.slug=p.slug)),
      'producing',(select count(*) from labnarrative_engine_v3.runs r where r.state='producing' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'resumable',(select count(*) from labnarrative_engine_v3.runs r where r.state='producing' and coalesce(r.checkpoint_at,r.updated_at,r.started_at) < now()-make_interval(mins=>coalesce(v_stale,45)) and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'finalReview',(select count(*) from labnarrative_engine_v3.runs r where r.state='final_review' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'published',(select count(*) from labnarrative_engine_v3.runs r where r.state='published' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'blocked',(select count(*) from labnarrative_engine_v3.runs r where r.state='blocked' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'completed',(select count(*) from labnarrative_engine_v3.runs r where r.state='completed' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived')))
    ),
    'queue',coalesce((select jsonb_agg(jsonb_build_object('prospectId',p.id,'piName',p.pi_name,'slug',p.slug,'institution',p.institution,'score',p.qualification_score,'queuedAt',p.queued_at) order by p.queued_at asc nulls last,p.created_at asc) from public.prospects p where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>'' and not exists(select 1 from public.sites s where s.slug=p.slug)),'[]'::jsonb),
    'runs',coalesce((select jsonb_agg(jsonb_build_object(
      'runId',r.id,'prospectId',r.prospect_id,'siteId',r.site_id,'piName',r.pi_name,'slug',r.slug,'state',r.state,
      'blockedReason',r.blocked_reason,'startedAt',r.started_at,'updatedAt',r.updated_at,
      'checkpointStage',r.checkpoint_stage,'checkpointAt',r.checkpoint_at,'resumeCount',r.resume_count,
      'isResumable',(r.state='producing' and coalesce(r.checkpoint_at,r.updated_at,r.started_at) < now()-make_interval(mins=>coalesce(v_stale,45))),
      'previewPath',case when r.site_id is not null then '/admin/preview/'||r.slug else null end,
      'publicUrl',case when r.state in ('published','completed') then 'https://'||r.slug||'.labnarrative.com' else null end,
      'evidenceCount',(select count(*) from labnarrative_engine_v3.evidence e where e.run_id=r.id and e.status='verified'),
      'assetCount',(select count(*) from labnarrative_engine_v3.assets a where a.run_id=r.id and a.status='verified')
    ) order by r.updated_at desc) from labnarrative_engine_v3.runs r where r.state<>'cancelled' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;