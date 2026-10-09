-- PVOS obligations: separate documented applicability from scheduling status.
-- Existing templates remain unconfirmed until explicitly reviewed by the QPPV.
alter table public.pvos_obligations
  add column if not exists basis_confirmed boolean not null default false;

alter table public.pvos_obligations
  add constraint pvos_obligations_confirmed_basis_check
  check (
    not basis_confirmed or
    (source_type is not null and lower(source_type) <> 'template'
     and nullif(btrim(source_reference),'') is not null
     and nullif(btrim(requirement_text),'') is not null)
  );

comment on column public.pvos_obligations.basis_confirmed is
  'Explicit QPPV confirmation that the obligation source and applicability rationale have been checked; separate from scheduling active.';

-- Scope completion checks to work linked to an obligation. The existing named
-- review, staged-approval, departmental and authority guards remain in place.
create or replace function public.pvos_guard_obligation_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_required boolean;
 v_latest_review_status text;
 v_latest_reviewer uuid;
 v_approval_count integer;
begin
 if new.status is distinct from 'complete'
    or old.status is not distinct from 'complete'
    or new.obligation_id is null then
   return new;
 end if;
 select o.evidence_required into v_required
 from public.pvos_obligations o
 where o.id=new.obligation_id;

 if v_required and not exists(
   select 1 from public.pvos_task_evidence e
   where e.task_id=new.id and e.archived_at is null
 ) then
   raise exception 'Evidence is required before this obligation activity can be completed';
 end if;

 if exists(select 1 from public.pvos_task_reviews r where r.task_id=new.id and r.status='pending') then
   raise exception 'Wait for the assigned reviewer to decide before completion';
 end if;

 -- When the generated work has a named reviewer, a named approval or fully
 -- completed staged route is required. Manual completion must not bypass it.
 if new.reviewer_user_id is not null then
   select r.status,r.assigned_to into v_latest_review_status,v_latest_reviewer
   from public.pvos_task_reviews r
   where r.task_id=new.id
   order by r.cycle desc limit 1;
   if v_latest_review_status='approved' and v_latest_reviewer=new.reviewer_user_id then
     return new;
   end if;
   select count(*) into v_approval_count
   from public.pvos_task_approvals a where a.task_id=new.id;
   if v_approval_count>0 and not exists(
     select 1 from public.pvos_task_approvals a where a.task_id=new.id
       and a.status not in ('approved','skipped')
   ) and exists(
     select 1 from public.pvos_task_approvals a where a.task_id=new.id and a.status='approved'
   ) then
     return new;
   end if;
   raise exception 'The assigned reviewer must approve this obligation activity before completion';
 end if;

 return new;
end $$;

drop trigger if exists pvos_guard_obligation_completion on public.pvos_tasks;
create trigger pvos_guard_obligation_completion
before update of status on public.pvos_tasks
for each row execute function public.pvos_guard_obligation_completion();

revoke all on function public.pvos_guard_obligation_completion() from public,anon,authenticated;
