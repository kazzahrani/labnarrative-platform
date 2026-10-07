-- Focused dual review builds on the existing table and RPCs. All new code uses invoker security.
create or replace function public.pvos_literature_decision_snapshot(p_run_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'literature_item_id',i.id,'product_id',i.product_id,'source_id',i.source_id,
    'title',i.title,'doi',i.doi,'article_url',i.article_url,'pmid',i.metadata->>'pmid',
    'review_status',i.review_status,'reviewer_user_id',i.reviewer_user_id,
    'reviewed_at',i.reviewed_at,'decision_note',i.decision_note,
    'followups',coalesce((select jsonb_agg(jsonb_build_object('destination',f.destination,'created_by',f.created_by,'created_at',f.created_at) order by f.destination)
      from public.pvos_literature_followups f where f.literature_item_id=i.id and f.status<>'dismissed'),'[]'::jsonb)
  ) order by i.id),'[]'::jsonb)
  from public.pvos_literature_items i where i.run_id=p_run_id;
$$;
revoke all on function public.pvos_literature_decision_snapshot(uuid) from public,anon;
grant execute on function public.pvos_literature_decision_snapshot(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.pvos_assign_literature_second_review(p_run_id uuid, p_assigned_to uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_id uuid;
  v_open integer;
  v_summary jsonb;
  v_scope_ids jsonb;
  v_scope_snapshot jsonb;
  v_reviewers jsonb;
  v_existing public.pvos_literature_second_reviews%rowtype;
  v_history jsonb := '[]'::jsonb;
  v_cycle integer := 1;
begin
  select organization_id into v_org
  from public.pvos_literature_runs
  where id=p_run_id for update;

  if v_org is null or not public.pvos_is_member(v_org) then
    raise exception 'Not authorized for this screening run';
  end if;

  select count(*) into v_open
  from public.pvos_literature_items
  where run_id=p_run_id
    and review_status='unreviewed';

  if v_open>0 then
    raise exception 'Cannot assign second review while % literature item(s) are still open',v_open;
  end if;

  if exists(select 1 from public.pvos_literature_screening_records where run_id=p_run_id) then
    raise exception 'Completed screening evidence is immutable';
  end if;

  if p_assigned_to=auth.uid() or exists(
    select 1 from public.pvos_literature_items where run_id=p_run_id and reviewer_user_id=p_assigned_to
  ) then
    raise exception 'Second reviewer must be independent of every first-review decision';
  end if;

  if not exists (
    select 1
    from public.pvos_memberships
    where organization_id=v_org and user_id=p_assigned_to
  ) then
    raise exception 'Assigned reviewer is not a workspace member';
  end if;

  select jsonb_build_object(
    'total',count(*),
    'relevant',count(*) filter (where review_status='relevant'),
    'needs_review',count(*) filter (where review_status='needs_review'),
    'not_relevant',count(*) filter (where review_status='not_relevant'),
    'likely_relevant',count(*) filter (where relevance='likely_relevant'),
    'saudi_alerts',count(*) filter (where coalesce((metadata->>'urgent_saudi')::boolean,false)),
    'full_text',count(*) filter (where coalesce((metadata->>'full_text_required')::boolean,false)),
    'scope_count',count(*) filter (
      where review_status in ('relevant','needs_review')
         or relevance='likely_relevant'
         or coalesce((metadata->>'urgent_saudi')::boolean,false)
         or coalesce((metadata->>'full_text_required')::boolean,false)
    )
  )
  into v_summary
  from public.pvos_literature_items
  where run_id=p_run_id;

  select coalesce(jsonb_agg(id::text order by created_at),'[]'::jsonb)
  into v_scope_ids
  from public.pvos_literature_items
  where run_id=p_run_id
    and (
      review_status in ('relevant','needs_review')
      or relevance='likely_relevant'
      or coalesce((metadata->>'urgent_saudi')::boolean,false)
      or coalesce((metadata->>'full_text_required')::boolean,false)
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',i.id,
      'title',i.title,
      'article_url',i.article_url,
      'journal',i.journal,
      'publication_date',i.publication_date,
      'abstract',i.abstract,
      'product_id',i.product_id,
      'source_id',i.source_id,
      'review_status',i.review_status,
      'relevance',i.relevance,
      'ai_reason',i.ai_reason,
      'reviewer_user_id',i.reviewer_user_id,
      'reviewed_at',i.reviewed_at,
      'decision_note',i.decision_note,
      'saudi_alert',coalesce((i.metadata->>'urgent_saudi')::boolean,false),
      'full_text_required',coalesce((i.metadata->>'full_text_required')::boolean,false),
      'product_role',i.metadata->>'product_role',
      'publication_context',i.metadata->>'publication_context',
      'finding_types',coalesce(i.metadata->'finding_types','[]'::jsonb),
      'followups',coalesce((
        select jsonb_agg(f.destination order by f.destination)
        from public.pvos_literature_followups f
        where f.literature_item_id=i.id
          and f.status<>'dismissed'
      ),'[]'::jsonb)
    )
    order by
      case when coalesce((i.metadata->>'urgent_saudi')::boolean,false) then 0
           when i.review_status='relevant' then 1
           when i.relevance='likely_relevant' then 2
           else 3 end,
      i.created_at
  ),'[]'::jsonb)
  into v_scope_snapshot
  from public.pvos_literature_items i
  where i.run_id=p_run_id
    and (
      i.review_status in ('relevant','needs_review')
      or i.relevance='likely_relevant'
      or coalesce((i.metadata->>'urgent_saudi')::boolean,false)
      or coalesce((i.metadata->>'full_text_required')::boolean,false)
    );

  select coalesce(jsonb_agg(distinct reviewer_user_id::text),'[]'::jsonb)
  into v_reviewers
  from public.pvos_literature_items
  where run_id=p_run_id
    and reviewer_user_id is not null;

  select * into v_existing
  from public.pvos_literature_second_reviews
  where run_id=p_run_id;

  if v_existing.status in ('pending','approved') then
    raise exception 'Only a returned second review can be reassigned';
  end if;

  if v_existing.id is not null then
    v_history := coalesce(v_existing.metadata->'history','[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'cycle',coalesce((v_existing.metadata->>'assignment_cycle')::integer,1),
          'assigned_to',v_existing.assigned_to,
          'assigned_by',v_existing.assigned_by,
          'assigned_at',v_existing.assigned_at,
          'status',v_existing.status,
          'reviewed_by',v_existing.reviewed_by,
          'reviewed_at',v_existing.reviewed_at,
          'note',v_existing.note,
          'metadata',v_existing.metadata-'history'
        )
      );
    v_cycle := coalesce((v_existing.metadata->>'assignment_cycle')::integer,1)+1;
  end if;

  insert into public.pvos_literature_second_reviews(
    organization_id,run_id,assigned_to,assigned_by,assigned_at,status,
    reviewed_by,reviewed_at,note,metadata
  )
  values(
    v_org,p_run_id,p_assigned_to,auth.uid(),now(),'pending',
    null,null,null,
    jsonb_build_object(
      'assigned_from','literature_run',
      'scope_version','v3',
      'scope_rule','Relevant + Needs review + Likely relevant + Saudi alerts + Full-text decisions',
      'assignment_cycle',v_cycle,
      'summary',v_summary,
      'scope_item_ids',v_scope_ids,
      'scope_snapshot',v_scope_snapshot,
      'decision_snapshot',public.pvos_literature_decision_snapshot(p_run_id),
      'first_reviewer_user_ids',v_reviewers,
      'snapshot_at',now(),
      'history',v_history
    )
  )
  on conflict(run_id) do update
  set assigned_to=excluded.assigned_to,
      assigned_by=excluded.assigned_by,
      assigned_at=excluded.assigned_at,
      status='pending',
      reviewed_by=null,
      reviewed_at=null,
      note=null,
      metadata=excluded.metadata
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pvos_decide_literature_second_review(p_run_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.pvos_literature_second_reviews%rowtype;
  v_open integer;
  v_changed integer;
begin
  if p_decision not in ('approved','returned') then
    raise exception 'Decision must be approved or returned';
  end if;

  perform 1 from public.pvos_literature_runs where id=p_run_id for update;

  select * into v_row
  from public.pvos_literature_second_reviews
  where run_id=p_run_id;

  if v_row.id is null then
    raise exception 'Second review is not assigned';
  end if;

  if auth.uid() is null or not public.pvos_is_member(v_row.organization_id) then
    raise exception 'Not authorized for this screening run';
  end if;

  if v_row.assigned_to<>auth.uid() then
    raise exception 'Only the assigned second reviewer can decide this run';
  end if;

  if exists(select 1 from public.pvos_literature_items where run_id=p_run_id and reviewer_user_id=auth.uid()) then
    raise exception 'Second reviewer must be independent of every first-review decision';
  end if;

  if v_row.status<>'pending' then
    raise exception 'This second-review assignment is no longer pending';
  end if;

  if p_decision='approved' then
    select count(*) into v_open
    from public.pvos_literature_items
    where run_id=p_run_id
      and review_status in ('unreviewed','needs_review');

    if v_open>0 then
      raise exception 'Cannot approve while % literature item(s) are still open',v_open;
    end if;

    if v_row.metadata->'decision_snapshot' is not null then
      v_changed := case when public.pvos_literature_decision_snapshot(p_run_id) is distinct from v_row.metadata->'decision_snapshot' then 1 else 0 end;
    else
      select count(*) into v_changed from public.pvos_literature_items where run_id=p_run_id and updated_at>v_row.assigned_at;
    end if;

    if v_changed>0 then
      raise exception 'First-review decisions changed after assignment. Return or reassign the second review to capture a fresh snapshot';
    end if;
  elsif coalesce(trim(p_note),'')='' then
    raise exception 'A return note is required';
  end if;

  update public.pvos_literature_second_reviews
  set status=p_decision,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      note=nullif(trim(p_note),''),
      metadata=metadata||jsonb_build_object(
        'decision',p_decision,
        'decision_at',now(),
        'decision_by',auth.uid()
      )
  where id=v_row.id;

  return p_decision;
end;
$function$
;

-- Serialize decisions, assignment and completion on the parent run. Lock the
-- screening decisions while pending/approved; enrichment can still add text.
create or replace function public.pvos_guard_literature_review_write()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_run uuid; v_locked boolean; v_status text;
begin
  if tg_table_name='pvos_literature_items' then
    v_run:=case when tg_op='DELETE' then old.run_id else new.run_id end;
    if tg_op='UPDATE' and (new.id,new.run_id,new.organization_id) is distinct from (old.id,old.run_id,old.organization_id) then
      raise exception 'Literature item identity and run cannot be changed';
    end if;
    if tg_op='UPDATE' and (new.review_status,new.reviewer_user_id,new.reviewed_at,new.decision_note,new.product_id,new.source_id,new.title,new.doi,new.article_url)
      is not distinct from (old.review_status,old.reviewer_user_id,old.reviewed_at,old.decision_note,old.product_id,old.source_id,old.title,old.doi,old.article_url) then
      return new;
    end if;
  else
    select run_id into v_run from public.pvos_literature_items where id=case when tg_op='DELETE' then old.literature_item_id else new.literature_item_id end;
    if tg_op='UPDATE' and (new.id,new.literature_item_id,new.organization_id) is distinct from (old.id,old.literature_item_id,old.organization_id) then
      raise exception 'Literature follow-up identity cannot be changed';
    end if;
    -- Downstream processing may progress after review; changing the screening
    -- destination or dismissing evidence changes the reviewed decision.
    if tg_op='UPDATE' and (new.destination,new.created_by,new.notes,new.status='dismissed')
      is not distinct from (old.destination,old.created_by,old.notes,old.status='dismissed') then return new; end if;
  end if;
  select status into v_status from public.pvos_literature_runs where id=v_run for update;
  select exists(select 1 from public.pvos_literature_second_reviews where run_id=v_run and status in ('pending','approved'))
    or exists(select 1 from public.pvos_literature_screening_records where run_id=v_run) into v_locked;
  if v_locked or v_status='complete' then
    raise exception 'Screening decisions are locked for second review or completed evidence. Return the review before changing decisions';
  end if;
  if tg_table_name='pvos_literature_items' and tg_op<>'DELETE' and auth.uid() is not null then
    if tg_op='INSERT' or (new.review_status,new.decision_note) is distinct from (old.review_status,old.decision_note) then
      new.reviewer_user_id:=case when new.review_status='unreviewed' then null else auth.uid() end;
      new.reviewed_at:=case when new.review_status='unreviewed' then null else now() end;
    elsif tg_op='UPDATE' and (new.reviewer_user_id,new.reviewed_at) is distinct from (old.reviewer_user_id,old.reviewed_at) then
      raise exception 'Reviewer identity and time are recorded by PVOS';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger pvos_literature_review_write_guard before insert or update or delete on public.pvos_literature_items
for each row execute function public.pvos_guard_literature_review_write();
create trigger pvos_literature_followup_write_guard before insert or update or delete on public.pvos_literature_followups
for each row execute function public.pvos_guard_literature_review_write();

-- Build evidence from database state, never from a client-supplied snapshot.
create or replace function public.pvos_guard_literature_evidence()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.pvos_literature_runs%rowtype; sr public.pvos_literature_second_reviews%rowtype; ds jsonb;
begin
  if tg_op<>'INSERT' then raise exception 'Completed screening evidence is immutable'; end if;
  select * into r from public.pvos_literature_runs where id=new.run_id for update;
  if auth.uid() is null or r.id is null or not public.pvos_is_member(r.organization_id) then raise exception 'Not authorized for screening completion'; end if;
  select * into sr from public.pvos_literature_second_reviews where run_id=r.id;
  if sr.id is null or sr.status<>'approved' or sr.reviewed_by is null or sr.reviewed_at is null then
    raise exception 'Required second review must be approved before completion';
  end if;
  if exists(select 1 from public.pvos_literature_items where run_id=r.id and review_status in ('unreviewed','needs_review')) then
    raise exception 'Every article requires a final QPPV decision before completion';
  end if;
  if exists(select 1 from public.pvos_literature_items where run_id=r.id and reviewer_user_id=sr.reviewed_by) then
    raise exception 'Second reviewer must be independent of every first-review decision';
  end if;
  ds:=public.pvos_literature_decision_snapshot(r.id);
  if sr.metadata->'decision_snapshot' is not null and ds is distinct from sr.metadata->'decision_snapshot' then
    raise exception 'Decisions changed after second-review assignment';
  end if;
  new.organization_id:=r.organization_id; new.company_id:=r.company_id;
  new.period_start:=r.period_start; new.period_end:=r.period_end;
  new.completed_by:=auth.uid(); new.completed_at:=now();
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'url',s.url,'method',s.method,'language',s.language) order by s.id),'[]'::jsonb)
    into new.source_snapshot from public.pvos_literature_sources s
    where s.id in(select source_id from public.pvos_literature_items where run_id=r.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'brand_name',p.brand_name,'active_ingredient',p.active_ingredient) order by p.id),'[]'::jsonb)
    into new.product_snapshot from public.pvos_products p where p.id in(select product_id from public.pvos_literature_items where run_id=r.id);
  new.search_snapshot:=coalesce(r.metadata->'searches','[]'::jsonb);
  select coalesce(jsonb_agg(d.value||jsonb_build_object('product',p.brand_name,'relevance',i.relevance,'saudi_alert',coalesce((i.metadata->>'urgent_saudi')::boolean,false),'full_text_required',coalesce((i.metadata->>'full_text_required')::boolean,false)) order by i.id),'[]'::jsonb)
    into new.decision_snapshot from jsonb_array_elements(ds) d join public.pvos_literature_items i on i.id=(d.value->>'literature_item_id')::uuid left join public.pvos_products p on p.id=i.product_id;
  select coalesce(jsonb_agg(jsonb_build_object('literature_item_id',f.literature_item_id,'destination',f.destination,'status',f.status,'created_by',f.created_by,'created_at',f.created_at) order by f.id),'[]'::jsonb)
    into new.downstream_snapshot from public.pvos_literature_followups f join public.pvos_literature_items i on i.id=f.literature_item_id where i.run_id=r.id and f.status<>'dismissed';
  select jsonb_build_object('total',count(*),'reviewed',count(*) filter(where review_status in ('relevant','not_relevant')),
    'open',count(*) filter(where review_status in ('unreviewed','needs_review')),'relevant',count(*) filter(where review_status='relevant'),
    'notRelevant',count(*) filter(where review_status='not_relevant'),'saudi',count(*) filter(where coalesce((metadata->>'urgent_saudi')::boolean,false)),
    'signal',(select count(*) from public.pvos_literature_followups f join public.pvos_literature_items i on i.id=f.literature_item_id where i.run_id=r.id and f.destination='signal_review' and f.status<>'dismissed'),
    'psur',(select count(*) from public.pvos_literature_followups f join public.pvos_literature_items i on i.id=f.literature_item_id where i.run_id=r.id and f.destination='psur_evidence' and f.status<>'dismissed'))
    into new.metrics from public.pvos_literature_items where run_id=r.id;
  new.metadata:=jsonb_build_object('record_version','v3','review_model','QPPV first review + independent second reviewer','generated_by','PVOS',
    'second_review',to_jsonb(sr),'first_reviewer_user_ids',sr.metadata->'first_reviewer_user_ids');
  return new;
end; $$;
create trigger pvos_literature_evidence_guard before insert or update or delete on public.pvos_literature_screening_records
for each row execute function public.pvos_guard_literature_evidence();

create or replace function public.pvos_guard_literature_run_completion()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status='complete' and (new.status,new.completed_by,new.completed_at,new.organization_id,new.company_id,new.period_start,new.period_end)
    is distinct from (old.status,old.completed_by,old.completed_at,old.organization_id,old.company_id,old.period_start,old.period_end) then
    raise exception 'Completed screening run is immutable';
  end if;
  if new.status='complete' and (tg_op='INSERT' or old.status<>'complete') then
    if not exists(select 1 from public.pvos_literature_screening_records e join public.pvos_literature_second_reviews sr on sr.run_id=e.run_id where e.run_id=new.id and sr.status='approved') then
      raise exception 'Complete screening through the approved dual-review evidence workflow';
    end if;
  end if;
  return new;
end; $$;
create trigger pvos_literature_run_completion_guard before insert or update on public.pvos_literature_runs
for each row execute function public.pvos_guard_literature_run_completion();

create or replace function public.pvos_complete_literature_screening(p_run_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.pvos_literature_runs%rowtype; e public.pvos_literature_screening_records%rowtype;
begin
  select * into r from public.pvos_literature_runs where id=p_run_id for update;
  if r.id is null or auth.uid() is null or not public.pvos_is_member(r.organization_id) then raise exception 'Not authorized for this screening run'; end if;
  select * into e from public.pvos_literature_screening_records where run_id=r.id;
  if e.id is not null then return e.id; end if;
  insert into public.pvos_literature_screening_records(organization_id,run_id,company_id,period_start,period_end)
    values(r.organization_id,r.id,r.company_id,r.period_start,r.period_end) returning * into e;
  update public.pvos_literature_runs set status='complete',completed_by=e.completed_by,completed_at=e.completed_at,reviewed_count=(e.metrics->>'reviewed')::integer where id=r.id;
  return e.id;
end; $$;
revoke all on function public.pvos_complete_literature_screening(uuid) from public,anon;
grant execute on function public.pvos_complete_literature_screening(uuid) to authenticated;
revoke all on function public.pvos_assign_literature_second_review(uuid,uuid), public.pvos_decide_literature_second_review(uuid,text,text) from public,anon;
grant execute on function public.pvos_assign_literature_second_review(uuid,uuid), public.pvos_decide_literature_second_review(uuid,text,text) to authenticated;
revoke all on function public.pvos_guard_literature_review_write(),public.pvos_guard_literature_evidence(),public.pvos_guard_literature_run_completion() from public,anon;
