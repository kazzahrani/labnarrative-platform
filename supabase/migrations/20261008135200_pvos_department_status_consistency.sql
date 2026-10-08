-- Keep departmental request status and its Dashboard task status in lockstep.
-- This prevents generic task controls from jumping ahead of the department workflow.
create or replace function public.pvos_guard_department_completion()
returns trigger language plpgsql set search_path='' as $$
declare v_status text; v_expected text;
begin
 if new.status is not distinct from old.status then return new; end if;
 select status into v_status from public.pvos_department_requests where task_id=old.id;
 if not found then return new; end if;
 v_expected:=case v_status
  when 'draft' then 'not_started'
  when 'waiting' then 'awaiting_external'
  when 'received' then 'in_progress'
  when 'returned' then 'in_progress'
  when 'complete' then 'complete'
  when 'cancelled' then 'cancelled' end;
 if new.status is distinct from v_expected then
   raise exception 'Update the departmental request before changing its linked task status';
 end if;
 return new;
end $$;
