-- Prevent duplicate recurring tasks if workspace initialization/materialization overlaps.

with ranked as (
  select id,
         row_number() over (
           partition by obligation_id,due_at
           order by
             case when coalesce(metadata->>'generated_by','')='recurring_scheduler' then 0 else 1 end,
             created_at,
             id
         ) as rn
  from public.pvos_tasks
  where obligation_id is not null
)
delete from public.pvos_tasks
where id in (select id from ranked where rn>1);

create unique index if not exists pvos_tasks_obligation_due_unique
  on public.pvos_tasks(obligation_id,due_at)
  where obligation_id is not null;

create or replace function public.pvos_materialize_due_obligations(horizon_days integer default 30)
returns integer
language plpgsql
security definer
set search_path='public'
as $$
declare
  ob record;
  due_time timestamptz;
  horizon timestamptz := now() + make_interval(days => greatest(0, least(horizon_days, 365)));
  created_count integer := 0;
  next_time timestamptz;
  inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  for ob in
    select o.*, c.organization_id
    from public.pvos_obligations o
    join public.pvos_companies c on c.id=o.company_id
    where o.active=true
      and o.cadence <> 'event'
      and o.next_due_at is not null
      and o.next_due_at <= horizon
      and public.pvos_is_member(c.organization_id)
  loop
    due_time := ob.next_due_at;

    while due_time <= horizon loop
      insert into public.pvos_tasks(
        organization_id, company_id, product_id, obligation_id,
        title, activity_type, source, status, priority,
        owner_user_id, reviewer_user_id, due_at, metadata
      ) values (
        ob.organization_id, ob.company_id, ob.product_id, ob.id,
        ob.title, ob.activity_type, 'recurring', 'not_started', 'medium',
        ob.owner_user_id, ob.reviewer_user_id, due_time,
        jsonb_build_object('generated_by','recurring_scheduler')
      )
      on conflict (obligation_id,due_at) where obligation_id is not null do nothing;

      get diagnostics inserted_count = row_count;
      created_count := created_count + inserted_count;

      next_time := case ob.cadence
        when 'daily' then due_time + interval '1 day'
        when 'weekly' then due_time + interval '1 week'
        when 'monthly' then due_time + interval '1 month'
        when 'quarterly' then due_time + interval '3 months'
        when 'semiannual' then due_time + interval '6 months'
        when 'annual' then due_time + interval '1 year'
        else due_time + interval '100 years'
      end;
      due_time := next_time;
    end loop;

    update public.pvos_obligations
    set next_due_at=due_time
    where id=ob.id;
  end loop;

  return created_count;
end;
$$;
