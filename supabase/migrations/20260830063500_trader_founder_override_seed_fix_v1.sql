insert into public.trader_entitlement_overrides (owner_user_id, plan_id, reason, is_active, expires_at, updated_at)
select owners.owner_user_id, plan.id, 'founder_tester', true, null, now()
from (
  select a.owner_user_id
  from public.trader_accounts a
  where a.status = 'active'
    and a.owner_user_id is not null
  group by a.owner_user_id
) owners
join public.trader_subscription_plans plan on plan.slug = 'pro'
where (
  select count(*)
  from (
    select a2.owner_user_id
    from public.trader_accounts a2
    where a2.status = 'active'
      and a2.owner_user_id is not null
    group by a2.owner_user_id
  ) sole
) = 1
on conflict (owner_user_id) do update
set plan_id = excluded.plan_id,
    reason = excluded.reason,
    is_active = true,
    expires_at = null,
    updated_at = now();
