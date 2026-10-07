-- Historical records are not backfilled with an inferred approver.
alter table public.pvos_task_approvals add column completed_by uuid references auth.users(id);
alter table public.pvos_task_approvals add column completed_by_email text;
alter table public.pvos_task_approvals add column decision_context jsonb;

create function public.pvos_guard_approval_write() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    if tg_op<>'INSERT' then raise exception 'Use the authorized approval workflow'; end if;
    if new.status<>'pending' or new.completed_at is not null or new.completed_by is not null or new.completed_by_email is not null or new.decision_context is not null then
      raise exception 'New approval steps must start pending without a decision';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger pvos_guard_approval_write before insert or update or delete on public.pvos_task_approvals
  for each row execute function public.pvos_guard_approval_write();

create function public.pvos_guard_approval_completion() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='complete' and old.status is distinct from 'complete' and exists(
    select 1 from public.pvos_task_approvals where task_id=new.id and status not in ('approved','skipped')
  ) then raise exception 'Required approval steps must finish before this task can be completed'; end if;
  return new;
end $$;
create trigger pvos_guard_approval_completion before update on public.pvos_tasks
  for each row execute function public.pvos_guard_approval_completion();

create function public.pvos_send_task_for_approval(p_task_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.pvos_tasks%rowtype; v_first uuid;
begin
  select * into t from public.pvos_tasks where id=p_task_id for update;
  if not found or auth.uid() is null or not public.pvos_is_member(t.organization_id) then raise exception 'Task not accessible'; end if;
  if t.status in ('complete','cancelled') then raise exception 'A completed or cancelled task cannot be sent for approval'; end if;
  if exists(select 1 from public.pvos_task_approvals where task_id=t.id and status in ('rejected','skipped')) then
    raise exception 'This route contains a rejected or skipped step; a new approval route is required';
  end if;
  if not exists(select 1 from public.pvos_task_approvals where task_id=t.id and status='in_review') then
    select id into v_first from public.pvos_task_approvals where task_id=t.id and status='pending' order by step_position,id limit 1;
    if v_first is null then raise exception 'No pending approval step; previous decisions remain in History'; end if;
    update public.pvos_task_approvals set status='in_review',received_at=now() where id=v_first;
  end if;
  update public.pvos_tasks set status='awaiting_review',completed_at=null where id=t.id;
end $$;

create function public.pvos_approve_task_step(p_approval_id uuid,p_comment text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pvos_task_approvals%rowtype; t public.pvos_tasks%rowtype; n public.pvos_task_approvals%rowtype;
  v_role text; v_label text; v_next_label text; v_email text; v_now timestamptz:=now(); v_context jsonb;
begin
  select * into a from public.pvos_task_approvals where id=p_approval_id;
  if not found then raise exception 'Approval step not accessible'; end if;
  select * into t from public.pvos_tasks where id=a.task_id for update;
  if not found or auth.uid() is null or not public.pvos_is_member(t.organization_id) then raise exception 'Approval step not accessible'; end if;
  select * into a from public.pvos_task_approvals where id=p_approval_id for update;
  select role into v_role from public.pvos_memberships where organization_id=t.organization_id and user_id=auth.uid();
  select role into v_label from public.pvos_approval_steps where route_id=a.route_id and position=a.step_position;
  if a.assigned_user_id is not null then
    if a.assigned_user_id<>auth.uid() then raise exception 'Only the assigned reviewer can approve this step'; end if;
  elsif not coalesce(v_role='admin' or (
    (lower(v_label)='qppv' and v_role='qppv') or
    (lower(v_label) in ('deputy qppv','deputy_qppv') and v_role='deputy_qppv') or
    (lower(v_label)='quality' and v_role='quality') or (lower(v_label)='manager' and v_role='manager')
  ),false) then raise exception 'This unassigned step requires its reviewer role or a workspace administrator'; end if;
  if a.status='approved' then return coalesce(a.decision_context,'{}'::jsonb)||jsonb_build_object('already_approved',true,'task_id',t.id); end if;
  if a.status<>'in_review' or t.status in ('complete','cancelled') then raise exception 'Only the current active step can be approved'; end if;
  if exists(select 1 from public.pvos_task_approvals where task_id=t.id and step_position<a.step_position and status<>'approved') then
    raise exception 'An earlier approval step is incomplete';
  end if;
  if (select count(*) from public.pvos_task_approvals where task_id=t.id and status='in_review')<>1 or
    (select count(*) from public.pvos_task_approvals where task_id=t.id and step_position=a.step_position)<>1 then raise exception 'Approval route has conflicting active or duplicate steps'; end if;
  if exists(select 1 from public.pvos_task_approvals where task_id=t.id and step_position>a.step_position and status not in ('pending','approved')) then raise exception 'Later approval step is not ready'; end if;
  select * into n from public.pvos_task_approvals where task_id=t.id and step_position>a.step_position and status='pending' order by step_position,id limit 1;
  if n.id is not null then select role into v_next_label from public.pvos_approval_steps where route_id=n.route_id and position=n.step_position; end if;
  select email into v_email from auth.users where id=auth.uid();
  v_context:=jsonb_build_object('step_role',coalesce(v_label,'Step '||a.step_position),'acting_workspace_role',v_role,
    'task_title',t.title,'destination',case when n.id is null then 'task_complete' else 'next_step' end,
    'next_approval_id',n.id,'next_step_role',coalesce(v_next_label,case when n.id is not null then 'Step '||n.step_position end),'task_id',t.id);
  update public.pvos_task_approvals set status='approved',completed_at=v_now,completed_by=auth.uid(),completed_by_email=v_email,
    comment=nullif(trim(p_comment),''),decision_context=v_context where id=a.id;
  if n.id is not null then
    update public.pvos_task_approvals set status='in_review',received_at=v_now where id=n.id;
    update public.pvos_tasks set status='awaiting_review',completed_at=null where id=t.id;
  else
    update public.pvos_tasks set status='complete',completed_at=v_now where id=t.id;
  end if;
  return v_context||jsonb_build_object('already_approved',false);
end $$;
revoke all on function public.pvos_guard_approval_write(),public.pvos_guard_approval_completion(),public.pvos_send_task_for_approval(uuid),public.pvos_approve_task_step(uuid,text) from public,anon,authenticated;
grant execute on function public.pvos_send_task_for_approval(uuid),public.pvos_approve_task_step(uuid,text) to authenticated;
