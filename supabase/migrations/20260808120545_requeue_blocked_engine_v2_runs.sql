create or replace function labnarrative_engine.claim_next_queued_prospect()
returns table(run_id uuid, prospect_id uuid, pi_name text, slug text, qualification_score integer, state text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'labnarrative_engine'
as $function$
declare
  v_enabled boolean;
  v_max_concurrency integer;
  v_active integer;
  v_prospect_id uuid;
  v_run_id uuid;
  v_retry_state text;
begin
  select rt.enabled, rt.max_concurrency
    into v_enabled, v_max_concurrency
  from labnarrative_engine.runtime rt
  where rt.singleton = true
  for update;

  if coalesce(v_enabled, false) = false then
    raise exception 'engine_v2_disabled';
  end if;

  select count(*)::integer
    into v_active
  from labnarrative_engine.runs r
  where r.state in ('research','build','assets','verify');

  if v_active >= v_max_concurrency then
    return;
  end if;

  -- Prefer an explicitly requeued existing run. This preserves partial work and
  -- lets blocked runs re-enter through the same concurrency gate as new work.
  select r.id, r.prospect_id,
         case
           when r.stage_data->>'retryStage' in ('research','build','assets','verify')
             then r.stage_data->>'retryStage'
           else 'research'
         end
    into v_run_id, v_prospect_id, v_retry_state
  from labnarrative_engine.runs r
  join public.prospects p on p.id = r.prospect_id
  where r.state = 'queued'
    and p.status = 'queued'
  order by p.qualification_score desc nulls last, r.updated_at asc, r.id
  for update of r skip locked
  limit 1;

  if v_run_id is not null then
    update labnarrative_engine.runs r
    set state = v_retry_state,
        stage_data = (r.stage_data - 'retryStage') || jsonb_build_object('reclaimedAt', now()),
        blocked_reason = null,
        finished_at = null,
        updated_at = now()
    where r.id = v_run_id;

    insert into labnarrative_engine.events(run_id,event_type,stage,message,payload)
    values(
      v_run_id,
      'run_reclaimed',
      v_retry_state,
      'Requeued PI reclaimed by Engine v2 and returned to its retry stage.',
      jsonb_build_object('prospectId',v_prospect_id,'retryStage',v_retry_state)
    );

    return query
    select r.id,p.id,p.pi_name,p.slug,p.qualification_score,r.state
    from labnarrative_engine.runs r
    join public.prospects p on p.id=r.prospect_id
    where r.id=v_run_id;
    return;
  end if;

  select p.id
    into v_prospect_id
  from public.prospects p
  where p.status = 'queued'
    and not exists (
      select 1 from public.sites s
      where s.id = p.site_id
         or (p.slug is not null and s.slug = p.slug)
    )
    and not exists (
      select 1 from labnarrative_engine.runs r
      where r.prospect_id = p.id
    )
  order by p.qualification_score desc nulls last, p.created_at asc, p.id
  for update skip locked
  limit 1;

  if v_prospect_id is null then return; end if;

  insert into labnarrative_engine.runs (
    prospect_id,state,stage_data,evidence,started_at,updated_at
  )
  select
    p.id,
    'research',
    jsonb_build_object(
      'claimedFrom','public.prospects',
      'legacyProspectStatus',p.status,
      'qualificationScore',p.qualification_score,
      'piName',p.pi_name,
      'slug',p.slug
    ),
    '{}'::jsonb,
    now(),now()
  from public.prospects p
  where p.id=v_prospect_id
  returning id into v_run_id;

  insert into labnarrative_engine.events(run_id,event_type,stage,message,payload)
  values(v_run_id,'run_claimed','research','Queued PI claimed by Engine v2 and entered Research.',jsonb_build_object('prospectId',v_prospect_id));

  return query
  select r.id,p.id,p.pi_name,p.slug,p.qualification_score,r.state
  from labnarrative_engine.runs r
  join public.prospects p on p.id=r.prospect_id
  where r.id=v_run_id;
end;
$function$;

do $block$
declare
  rec record;
  v_retry_stage text;
  v_previous_reason text;
begin
  for rec in
    select r.id, r.prospect_id, r.blocked_reason
    from labnarrative_engine.runs r
    where r.state = 'blocked'
    order by r.updated_at, r.id
  loop
    select case
             when e.stage in ('research','build','assets','verify') then e.stage
             else 'research'
           end
      into v_retry_stage
    from labnarrative_engine.events e
    where e.run_id = rec.id
      and e.event_type <> 'run_blocked'
    order by e.created_at desc, e.id desc
    limit 1;

    v_retry_stage := coalesce(v_retry_stage, 'research');
    v_previous_reason := rec.blocked_reason;

    delete from labnarrative_engine.stage_dispatches d
    where d.run_id = rec.id and d.stage = v_retry_stage;

    update labnarrative_engine.runs r
    set state = 'queued',
        stage_data = jsonb_set(
          jsonb_set(coalesce(r.stage_data,'{}'::jsonb), '{retryStage}', to_jsonb(v_retry_stage), true),
          '{lastBlockedReason}', to_jsonb(coalesce(v_previous_reason,'')), true
        ),
        blocked_reason = null,
        finished_at = null,
        updated_at = now()
    where r.id = rec.id;

    update public.prospects p
    set status = 'queued', updated_at = now()
    where p.id = rec.prospect_id;

    insert into labnarrative_engine.events(run_id,event_type,stage,message,payload)
    values(
      rec.id,
      'run_requeued',
      'queued',
      'Blocked run returned to the Engine v2 queue for a controlled retry.',
      jsonb_build_object('retryStage',v_retry_stage,'previousBlockedReason',v_previous_reason)
    );
  end loop;
end;
$block$;