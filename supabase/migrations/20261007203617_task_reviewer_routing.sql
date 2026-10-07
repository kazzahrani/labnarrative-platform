-- Named task reviews complement, rather than replace, existing staged approvals.
create table public.pvos_task_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pvos_organizations(id),
  company_id uuid not null references public.pvos_companies(id),
  task_id uuid not null references public.pvos_tasks(id),
  cycle integer not null check(cycle>0),
  status text not null default 'pending' check(status in ('pending','approved','returned')),
  sent_by uuid not null references auth.users(id),
  sent_by_email text not null,
  assigned_to uuid not null references auth.users(id),
  assigned_email text not null,
  sent_at timestamptz not null default now(),
  submission_note text,
  snapshot jsonb not null,
  decided_by uuid references auth.users(id),
  decided_email text,
  decided_role text,
  decided_at timestamptz,
  decision_note text,
  unique(task_id,cycle),
  check(sent_by<>assigned_to),
  check((status='pending' and decided_by is null and decided_at is null) or
    (status<>'pending' and decided_by=assigned_to and decided_at is not null)),
  check(status<>'returned' or length(trim(decision_note))>0)
);
create unique index pvos_task_reviews_one_pending on public.pvos_task_reviews(task_id) where status='pending';
create index pvos_task_reviews_queue on public.pvos_task_reviews(organization_id,status,assigned_to,sent_at);
alter table public.pvos_task_reviews enable row level security;
revoke all on public.pvos_task_reviews from public,anon,authenticated;
grant select on public.pvos_task_reviews to authenticated;
create policy pvos_task_reviews_read on public.pvos_task_reviews for select to authenticated using(public.pvos_is_member(organization_id));

create function public.pvos_audit_task_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata)
  values(new.organization_id,new.company_id,auth.uid(),'task_review',new.id,lower(tg_op),
    case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),
    jsonb_build_object('task_id',new.task_id,'actor_email',case when tg_op='INSERT' then new.sent_by_email else new.decided_email end,'reason',coalesce(new.decision_note,new.submission_note)));
  return new;
end $$;
create trigger pvos_task_reviews_audit after insert or update on public.pvos_task_reviews for each row execute function public.pvos_audit_task_review();

create function public.pvos_guard_task_review() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.pvos_task_reviews where task_id=old.id) then raise exception 'Task review history must be retained'; end if;
    return old;
  end if;
  if exists(select 1 from public.pvos_task_reviews where task_id=old.id) and (new.organization_id<>old.organization_id or new.company_id<>old.company_id) then
    raise exception 'Reviewed tasks cannot move to another workspace or company';
  end if;
  if current_user not in ('postgres','supabase_admin','service_role') then
    if exists(select 1 from public.pvos_task_reviews where task_id=old.id and status='pending') and
      (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
      raise exception 'Task is locked while its assigned reviewer decides';
    end if;
    if new.status='complete' and old.status<>'complete' and exists(select 1 from public.pvos_task_reviews where task_id=old.id) then
      raise exception 'The assigned reviewer must approve the submitted task';
    end if;
    if new.status='awaiting_review' and old.status<>'awaiting_review' and not exists(select 1 from public.pvos_task_approvals where task_id=old.id) then
      raise exception 'Choose a reviewer and use Send for review';
    end if;
  end if;
  return new;
end $$;
create trigger pvos_guard_task_review before update or delete on public.pvos_tasks for each row execute function public.pvos_guard_task_review();

-- Serialize evidence/route edits with submission, so its evidence register is stable.
create function public.pvos_guard_review_attachment() returns trigger language plpgsql set search_path='' as $$
declare v_id uuid;
begin
  for v_id in select id from public.pvos_tasks where id in
    (case when tg_op<>'INSERT' then old.task_id end,case when tg_op<>'DELETE' then new.task_id end) order by id for update loop
    if exists(select 1 from public.pvos_task_reviews where task_id=v_id and status='pending') then
      raise exception 'Submitted evidence and approval routes are locked until the reviewer returns or approves';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger pvos_review_evidence_lock before insert or update or delete on public.pvos_task_evidence for each row execute function public.pvos_guard_review_attachment();
create trigger pvos_review_approval_lock before insert or update or delete on public.pvos_task_approvals for each row execute function public.pvos_guard_review_attachment();

create function public.pvos_send_task_review(p_task_id uuid,p_reviewer_id uuid,p_note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.pvos_tasks%rowtype; r public.pvos_task_reviews%rowtype; v_role text; v_sender text; v_reviewer text; v_snapshot jsonb; v_cycle integer;
begin
  select * into t from public.pvos_tasks where id=p_task_id for update;
  if not found or auth.uid() is null or not public.pvos_is_member(t.organization_id) then raise exception 'Task not accessible'; end if;
  select role into v_role from public.pvos_memberships where organization_id=t.organization_id and user_id=auth.uid();
  if t.owner_user_id is distinct from auth.uid() and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only the task owner or QPPV administrator can send this task'; end if;
  if t.status in ('complete','cancelled') then raise exception 'Reopen the task before submitting a new review'; end if;
  if exists(select 1 from public.pvos_task_approvals where task_id=t.id) then raise exception 'Use this task''s existing staged approval route'; end if;
  if p_reviewer_id is null or p_reviewer_id=auth.uid() or not exists(select 1 from public.pvos_memberships where organization_id=t.organization_id and user_id=p_reviewer_id) then
    raise exception 'Choose another member of this workspace as reviewer';
  end if;
  select * into r from public.pvos_task_reviews where task_id=t.id and status='pending';
  if found then
    if r.assigned_to<>p_reviewer_id then raise exception 'This task is already waiting for its assigned reviewer'; end if;
    return jsonb_build_object('review_id',r.id,'assigned_email',r.assigned_email,'cycle',r.cycle,'already_sent',true);
  end if;
  select email into v_sender from auth.users where id=auth.uid();
  select email into v_reviewer from auth.users where id=p_reviewer_id;
  if v_sender is null or v_reviewer is null then raise exception 'Reviewer account email is unavailable'; end if;
  select coalesce(max(cycle),0)+1 into v_cycle from public.pvos_task_reviews where task_id=t.id;
  v_snapshot:=jsonb_build_object('task',to_jsonb(t),'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.pvos_task_evidence e where e.task_id=t.id and e.archived_at is null),'[]'::jsonb),'snapshot_at',now(),'file_basis','Evidence references; document bytes remain in private storage');
  insert into public.pvos_task_reviews(organization_id,company_id,task_id,cycle,sent_by,sent_by_email,assigned_to,assigned_email,submission_note,snapshot)
  values(t.organization_id,t.company_id,t.id,v_cycle,auth.uid(),v_sender,p_reviewer_id,v_reviewer,nullif(trim(p_note),''),v_snapshot) returning * into r;
  update public.pvos_tasks set status='awaiting_review',reviewer_user_id=p_reviewer_id,completed_at=null where id=t.id;
  return jsonb_build_object('review_id',r.id,'assigned_email',r.assigned_email,'cycle',r.cycle,'already_sent',false);
end $$;

create function public.pvos_decide_task_review(p_review_id uuid,p_decision text,p_note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_task_reviews%rowtype; t public.pvos_tasks%rowtype; v_email text; v_role text;
begin
  select * into r from public.pvos_task_reviews where id=p_review_id;
  if not found then raise exception 'Review not accessible'; end if;
  select * into t from public.pvos_tasks where id=r.task_id for update;
  if not found or auth.uid() is null or not public.pvos_is_member(r.organization_id) then raise exception 'Review not accessible'; end if;
  select * into r from public.pvos_task_reviews where id=p_review_id for update;
  if auth.uid()<>r.assigned_to then raise exception 'Only the assigned reviewer can approve or return'; end if;
  if p_decision not in ('approved','returned') or p_decision is null then raise exception 'Choose Approve or Return'; end if;
  if r.status=p_decision then return jsonb_build_object('task_id',t.id,'status',r.status,'already_decided',true); end if;
  if r.status<>'pending' or t.status<>'awaiting_review' then raise exception 'This review is no longer pending'; end if;
  if p_decision='returned' and coalesce(length(trim(p_note)),0)=0 then raise exception 'A return reason is required'; end if;
  if exists(select 1 from public.pvos_task_approvals where task_id=t.id) then raise exception 'A staged approval route conflicts with this review'; end if;
  select email into v_email from auth.users where id=auth.uid();
  select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
  update public.pvos_task_reviews set status=p_decision,decided_by=auth.uid(),decided_email=v_email,decided_role=v_role,decided_at=now(),decision_note=nullif(trim(p_note),'') where id=r.id;
  update public.pvos_tasks set status=case when p_decision='approved' then 'complete' else 'in_progress' end,completed_at=case when p_decision='approved' then now() end where id=t.id;
  return jsonb_build_object('task_id',t.id,'status',p_decision,'already_decided',false);
end $$;
revoke all on function public.pvos_audit_task_review(),public.pvos_guard_task_review(),public.pvos_guard_review_attachment(),public.pvos_send_task_review(uuid,uuid,text),public.pvos_decide_task_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pvos_send_task_review(uuid,uuid,text),public.pvos_decide_task_review(uuid,text,text) to authenticated;
