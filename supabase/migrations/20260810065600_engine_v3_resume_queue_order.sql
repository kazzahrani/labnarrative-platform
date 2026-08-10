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
    join public.prospects p on p.id=r.prospect_id
    where r.state='producing'
      and coalesce(r.checkpoint_at,r.updated_at,r.started_at) < now() - make_interval(mins=>coalesce(v_stale_minutes,45))
    order by p.queued_at asc nulls last,p.created_at asc,r.started_at asc,r.id asc
    for update of r skip locked
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