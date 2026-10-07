-- BEFORE INSERT runs before ON CONFLICT DO NOTHING. Existing demo rows must be
-- skipped, rather than validating the old seed's proposed approved/in_review values.
-- Returning NULL makes the operation a no-op; it cannot overwrite any decision.
create or replace function public.pvos_guard_approval_write() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('postgres','supabase_admin','service_role') then
    if tg_op<>'INSERT' then raise exception 'Use the authorized approval workflow'; end if;
    if new.seed_key is not null and exists(
      select 1 from public.pvos_task_approvals a where a.task_id=new.task_id and a.seed_key=new.seed_key
    ) then return null; end if;
    if new.status<>'pending' or new.completed_at is not null or new.completed_by is not null or new.completed_by_email is not null or new.decision_context is not null then
      raise exception 'New approval steps must start pending without a decision';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.pvos_guard_approval_write() from public,anon,authenticated;
