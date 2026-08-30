alter table public.trader_billing_config
  add column if not exists entitlements_enforced boolean not null default false,
  add column if not exists free_max_single_pair_bots integer not null default 1,
  add column if not exists free_max_multi_pair_bots integer not null default 0,
  add column if not exists free_max_active_exchanges integer not null default 0;

alter table public.trader_billing_config
  drop constraint if exists trader_billing_config_free_single_check,
  add constraint trader_billing_config_free_single_check check (free_max_single_pair_bots >= 0),
  drop constraint if exists trader_billing_config_free_multi_check,
  add constraint trader_billing_config_free_multi_check check (free_max_multi_pair_bots >= 0),
  drop constraint if exists trader_billing_config_free_exchanges_check,
  add constraint trader_billing_config_free_exchanges_check check (free_max_active_exchanges >= 0);

update public.trader_billing_config
set entitlements_enforced = false,
    free_max_single_pair_bots = 1,
    free_max_multi_pair_bots = 0,
    free_max_active_exchanges = 0,
    updated_at = now()
where id = 1;

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
    (sub.id is not null) as is_paid,
    coalesce(plan.max_single_pair_bots, cfg.free_max_single_pair_bots, 1) as max_single_pair_bots,
    coalesce(plan.max_multi_pair_bots, cfg.free_max_multi_pair_bots, 0) as max_multi_pair_bots,
    case when sub.id is not null then plan.max_active_exchanges else coalesce(cfg.free_max_active_exchanges, 0) end as max_active_exchanges
  from public.trader_billing_config cfg
  left join lateral (
    select s.id, s.plan_id
    from public.trader_subscriptions s
    where s.owner_user_id = p_owner_user_id
      and s.status = 'active'
    order by s.created_at desc
    limit 1
  ) sub on true
  left join public.trader_subscription_plans plan on plan.id = sub.plan_id
  where cfg.id = 1
  limit 1;
$$;

revoke all on function public.trader_effective_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.trader_effective_entitlements(uuid) to service_role;

create or replace function public.trader_enforce_bot_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_account_kind text;
  v_enforced boolean;
  v_plan text;
  v_paid boolean;
  v_max_single integer;
  v_max_multi integer;
  v_max_exchanges integer;
  v_new_multi boolean;
  v_old_multi boolean;
  v_used integer;
begin
  if coalesce(new.is_archived, false) then
    return new;
  end if;

  v_new_multi := coalesce(new.all_pairs, false) or coalesce(cardinality(new.pairs), 0) > 1;

  if tg_op = 'UPDATE' then
    v_old_multi := coalesce(old.all_pairs, false) or coalesce(cardinality(old.pairs), 0) > 1;
    if not coalesce(old.is_archived, false)
       and not coalesce(new.is_archived, false)
       and old.account_id = new.account_id
       and v_old_multi = v_new_multi then
      return new;
    end if;
  end if;

  select a.owner_user_id, a.account_kind
    into v_owner, v_account_kind
  from public.trader_accounts a
  where a.id = new.account_id;

  if v_owner is null then
    return new;
  end if;

  select e.enforcement_active, e.plan_slug, e.is_paid,
         e.max_single_pair_bots, e.max_multi_pair_bots, e.max_active_exchanges
    into v_enforced, v_plan, v_paid, v_max_single, v_max_multi, v_max_exchanges
  from public.trader_effective_entitlements(v_owner) e;

  if not coalesce(v_enforced, false) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 7361));

  if v_account_kind = 'real' and not coalesce(v_paid, false) then
    raise exception 'plan_live_trading_required' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_used
  from public.trader_bots b
  join public.trader_accounts a on a.id = b.account_id
  where a.owner_user_id = v_owner
    and a.status = 'active'
    and not coalesce(b.is_archived, false)
    and b.id <> new.id
    and ((coalesce(b.all_pairs, false) or coalesce(cardinality(b.pairs), 0) > 1) = v_new_multi);

  if v_new_multi then
    if v_used >= coalesce(v_max_multi, 0) then
      raise exception 'plan_multi_pair_bot_limit_reached' using errcode = 'P0001';
    end if;
  else
    if v_used >= coalesce(v_max_single, 0) then
      raise exception 'plan_single_pair_bot_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.trader_enforce_bot_entitlement() from public, anon, authenticated;
grant execute on function public.trader_enforce_bot_entitlement() to service_role;

drop trigger if exists trader_bots_entitlement_guard on public.trader_bots;
create trigger trader_bots_entitlement_guard
before insert or update of account_id, pairs, all_pairs, is_archived
on public.trader_bots
for each row execute function public.trader_enforce_bot_entitlement();

create or replace function public.trader_enforce_exchange_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_enforced boolean;
  v_plan text;
  v_paid boolean;
  v_max_single integer;
  v_max_multi integer;
  v_max_exchanges integer;
  v_used integer;
  v_provider text;
  v_new_slot boolean;
  v_old_slot boolean;
begin
  v_new_slot := lower(coalesce(new.status, '')) in ('pending', 'connected');
  if not v_new_slot then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_slot := lower(coalesce(old.status, '')) in ('pending', 'connected');
    if v_old_slot and old.account_id = new.account_id then
      if tg_table_name = 'trader_binance_connections' or lower(coalesce(old.provider, '')) = lower(coalesce(new.provider, '')) then
        return new;
      end if;
    end if;
  end if;

  select a.owner_user_id into v_owner
  from public.trader_accounts a
  where a.id = new.account_id;

  if v_owner is null then
    return new;
  end if;

  select e.enforcement_active, e.plan_slug, e.is_paid,
         e.max_single_pair_bots, e.max_multi_pair_bots, e.max_active_exchanges
    into v_enforced, v_plan, v_paid, v_max_single, v_max_multi, v_max_exchanges
  from public.trader_effective_entitlements(v_owner) e;

  if not coalesce(v_enforced, false) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 7361));

  if v_max_exchanges is null then
    return new;
  end if;

  select
    (
      select count(*)
      from public.trader_binance_connections c
      join public.trader_accounts a on a.id = c.account_id
      where a.owner_user_id = v_owner
        and a.status = 'active'
        and lower(coalesce(c.status, '')) in ('pending', 'connected')
        and (tg_table_name <> 'trader_binance_connections' or c.id <> new.id)
    ) +
    (
      select count(*)
      from public.trader_exchange_connections c
      join public.trader_accounts a on a.id = c.account_id
      where a.owner_user_id = v_owner
        and a.status = 'active'
        and lower(coalesce(c.status, '')) in ('pending', 'connected')
        and (tg_table_name <> 'trader_exchange_connections' or c.id <> new.id)
    ) into v_used;

  if v_used >= coalesce(v_max_exchanges, 0) then
    if tg_table_name = 'trader_binance_connections' then
      raise exception 'binance_plan_exchange_limit_reached' using errcode = 'P0001';
    else
      v_provider := lower(coalesce(new.provider, 'exchange'));
      raise exception using message = v_provider || '_plan_exchange_limit_reached', errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.trader_enforce_exchange_entitlement() from public, anon, authenticated;
grant execute on function public.trader_enforce_exchange_entitlement() to service_role;

drop trigger if exists trader_binance_entitlement_guard on public.trader_binance_connections;
create trigger trader_binance_entitlement_guard
before insert or update of account_id, provider, status
on public.trader_binance_connections
for each row execute function public.trader_enforce_exchange_entitlement();

drop trigger if exists trader_exchange_entitlement_guard on public.trader_exchange_connections;
create trigger trader_exchange_entitlement_guard
before insert or update of account_id, provider, status
on public.trader_exchange_connections
for each row execute function public.trader_enforce_exchange_entitlement();
