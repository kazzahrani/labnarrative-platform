alter table public.trader_billing_config
  add column if not exists payment_grace_days integer not null default 3;

alter table public.trader_billing_config
  drop constraint if exists trader_billing_config_payment_grace_days_check,
  add constraint trader_billing_config_payment_grace_days_check check (payment_grace_days between 0 and 30);

alter table public.trader_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists access_ends_at timestamptz,
  add column if not exists pending_plan_id uuid references public.trader_subscription_plans(id) on delete set null,
  add column if not exists pending_billing_interval text,
  add column if not exists pending_provider_plan_id text,
  add column if not exists plan_change_requested_at timestamptz,
  add column if not exists plan_change_effective_at timestamptz,
  add column if not exists provider_synced_at timestamptz;

alter table public.trader_subscriptions
  drop constraint if exists trader_subscriptions_pending_billing_interval_check,
  add constraint trader_subscriptions_pending_billing_interval_check
    check (pending_billing_interval is null or pending_billing_interval in ('monthly','annual'));

create unique index if not exists trader_subscriptions_one_provider_lifecycle_per_owner_idx
  on public.trader_subscriptions(owner_user_id)
  where status in ('approval_pending','active','suspended','payment_failed');

create table if not exists public.trader_entitlement_overrides (
  owner_user_id uuid primary key,
  plan_id uuid not null references public.trader_subscription_plans(id) on delete restrict,
  reason text not null default 'manual',
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trader_entitlement_overrides enable row level security;
revoke all on public.trader_entitlement_overrides from anon, authenticated;

-- Protect the current founder/test environment without hard-coding an email or user id.
-- This seed only runs when production has exactly one active Trader owner.
insert into public.trader_entitlement_overrides (owner_user_id, plan_id, reason, is_active, expires_at, updated_at)
select owners.owner_user_id, plan.id, 'founder_tester', true, null, now()
from (
  select a.owner_user_id
  from public.trader_accounts a
  where a.status = 'active'
  group by a.owner_user_id
) owners
join public.trader_subscription_plans plan on plan.slug = 'pro'
where (
  select count(*)
  from (
    select a2.owner_user_id
    from public.trader_accounts a2
    where a2.status = 'active'
    group by a2.owner_user_id
  ) sole
) = 1
on conflict (owner_user_id) do update
set plan_id = excluded.plan_id,
    reason = excluded.reason,
    is_active = true,
    expires_at = null,
    updated_at = now();

create or replace function public.trader_effective_entitlements(p_owner_user_id uuid)
returns table(
  enforcement_active boolean,
  plan_slug text,
  is_paid boolean,
  max_single_pair_bots integer,
  max_multi_pair_bots integer,
  max_active_exchanges integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(cfg.entitlements_enforced, false) as enforcement_active,
    coalesce(plan.slug, 'free') as plan_slug,
    (override_row.owner_user_id is not null or sub.id is not null) as is_paid,
    coalesce(plan.max_single_pair_bots, cfg.free_max_single_pair_bots, 1) as max_single_pair_bots,
    coalesce(plan.max_multi_pair_bots, cfg.free_max_multi_pair_bots, 0) as max_multi_pair_bots,
    case
      when override_row.owner_user_id is not null or sub.id is not null then plan.max_active_exchanges
      else coalesce(cfg.free_max_active_exchanges, 0)
    end as max_active_exchanges
  from public.trader_billing_config cfg
  left join lateral (
    select o.owner_user_id, o.plan_id
    from public.trader_entitlement_overrides o
    where o.owner_user_id = p_owner_user_id
      and o.is_active = true
      and (o.expires_at is null or o.expires_at > now())
    limit 1
  ) override_row on true
  left join lateral (
    select s.id, s.plan_id
    from public.trader_subscriptions s
    where s.owner_user_id = p_owner_user_id
      and (
        s.status = 'active'
        or (s.status = 'cancelled' and s.access_ends_at is not null and s.access_ends_at > now())
        or (s.status = 'payment_failed' and s.access_ends_at is not null and s.access_ends_at > now())
      )
    order by
      case s.status when 'active' then 0 when 'payment_failed' then 1 else 2 end,
      s.created_at desc
    limit 1
  ) sub on true
  left join public.trader_subscription_plans plan
    on plan.id = coalesce(override_row.plan_id, sub.plan_id)
  where cfg.id = 1
  limit 1;
$$;

revoke all on function public.trader_effective_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.trader_effective_entitlements(uuid) to service_role;

update public.trader_billing_config
set payment_grace_days = 3,
    checkout_enabled = false,
    entitlements_enforced = false,
    updated_at = now()
where id = 1;
