-- Returning clients may propose existing seeded evidence with ON CONFLICT DO NOTHING.
-- Suppress only a visible exact duplicate; never change its submitted reference.
create or replace function public.pvos_guard_review_attachment() returns trigger language plpgsql set search_path='' as $$
declare v_id uuid;
begin
  if tg_table_name='pvos_task_evidence' and tg_op='INSERT' then
    if new.seed_key is not null and exists(select 1 from public.pvos_task_evidence where task_id=new.task_id and seed_key=new.seed_key) then return null; end if;
  end if;
  for v_id in select id from public.pvos_tasks where id in
    (case when tg_op<>'INSERT' then old.task_id end,case when tg_op<>'DELETE' then new.task_id end) order by id for update loop
    if exists(select 1 from public.pvos_task_reviews where task_id=v_id and status='pending') then
      raise exception 'Submitted evidence and approval routes are locked until the reviewer returns or approves';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.pvos_guard_review_attachment() from public,anon,authenticated;
