-- Linked monthly tasks follow the independent monitoring workflow. Generic task
-- controls and generic review RPCs cannot bypass source checks or second review.
create function public.pvos_guard_authority_task() returns trigger
language plpgsql set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;
begin
 select * into p from public.pvos_authority_periods where task_id=old.id;
 if not found then return new;end if;
 if new.organization_id is distinct from p.organization_id
  or new.company_id is distinct from p.company_id
  or new.owner_user_id is distinct from p.owner_user_id
  or new.due_at is distinct from p.due_at
  or new.activity_type is distinct from 'authority_monitoring'
  or new.metadata->>'authority_period_id' is distinct from p.id::text then
  raise exception 'Manage the monthly task scope through Authority monitoring';
 end if;
 if current_user in ('authenticated','anon') and
  (new.status is distinct from old.status or new.completed_at is distinct from old.completed_at
   or new.reviewer_user_id is distinct from old.reviewer_user_id) then
  raise exception 'Open Authority monitoring to prepare, submit or review this monthly record';
 end if;
 if (p.status='draft' and new.status not in ('not_started','in_progress'))
  or (p.status='returned' and new.status<>'in_progress')
  or (p.status='pending_review' and (new.status<>'awaiting_review' or new.reviewer_user_id is distinct from p.reviewer_user_id))
  or (p.status='approved' and (new.status<>'complete' or not exists(select 1 from public.pvos_authority_records where period_id=p.id)))
  or (p.status<>'approved' and new.completed_at is not null)
  or (p.status='approved' and new.completed_at is null) then
  raise exception 'Task status must follow the independently reviewed authority monitoring record';
 end if;
 return new;
end $fn$;
revoke all on function public.pvos_guard_authority_task() from public,anon,authenticated;
create trigger pvos_authority_task_workflow before update on public.pvos_tasks
for each row execute function public.pvos_guard_authority_task();
