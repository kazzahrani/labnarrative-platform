create table if not exists private.performance_canary_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  note text,
  minimum_spot_balance_override_usd numeric(20,8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select,insert,update,delete on private.performance_canary_users to service_role;

create or replace function public.performance_canary_allowed_internal(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path=pg_catalog,private
as $$
  select coalesce((
    select enabled
    from private.performance_canary_users
    where user_id=p_user_id
  ),false)
$$;

create or replace function public.performance_canary_settings_internal(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=pg_catalog,private
as $$
  select coalesce((
    select jsonb_build_object(
      'enabled',enabled,
      'minimumSpotBalanceOverrideUsd',minimum_spot_balance_override_usd
    )
    from private.performance_canary_users
    where user_id=p_user_id
  ),jsonb_build_object('enabled',false,'minimumSpotBalanceOverrideUsd',null))
$$;

revoke all on function public.performance_canary_allowed_internal(uuid) from public,anon,authenticated;
revoke all on function public.performance_canary_settings_internal(uuid) from public,anon,authenticated;
grant execute on function public.performance_canary_allowed_internal(uuid) to service_role;
grant execute on function public.performance_canary_settings_internal(uuid) to service_role;

create or replace function public.performance_open_period_internal(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_spot_balance_usd numeric,
  p_eligibility_snapshot jsonb default '{}'::jsonb
)
returns private.performance_periods
language plpgsql
security invoker
set search_path=pg_catalog,public,private
as $$
declare
  v_config private.performance_plan_config%rowtype;
  v_row private.performance_periods%rowtype;
  v_canary private.performance_canary_users%rowtype;
  v_effective_minimum numeric;
begin
  if p_user_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'performance_period_invalid';
  end if;
  if p_spot_balance_usd is null or p_spot_balance_usd < 0 then
    raise exception 'performance_balance_invalid';
  end if;

  select * into v_config
  from private.performance_plan_config
  where singleton=true;

  v_effective_minimum:=v_config.minimum_spot_balance_usd;

  select * into v_canary
  from private.performance_canary_users
  where user_id=p_user_id and enabled=true;

  if found
     and v_canary.minimum_spot_balance_override_usd is not null
     and v_canary.minimum_spot_balance_override_usd > 0 then
    v_effective_minimum:=v_canary.minimum_spot_balance_override_usd;
  end if;

  insert into private.performance_periods(
    user_id,period_start,period_end,status,
    eligibility_spot_balance_usd,eligibility_snapshot,
    minimum_spot_balance_usd,monthly_charge_cap_usd,settlement_quote_asset
  )
  values(
    p_user_id,p_period_start,p_period_end,
    case when p_spot_balance_usd >= v_effective_minimum then 'open' else 'ineligible' end,
    p_spot_balance_usd,coalesce(p_eligibility_snapshot,'{}'::jsonb),
    v_effective_minimum,v_config.monthly_charge_cap_usd,v_config.settlement_quote_asset
  )
  on conflict(user_id,period_start) do update
    set eligibility_spot_balance_usd=excluded.eligibility_spot_balance_usd,
        eligibility_snapshot=excluded.eligibility_snapshot,
        minimum_spot_balance_usd=excluded.minimum_spot_balance_usd,
        status=excluded.status,
        updated_at=now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.performance_open_period_internal(uuid,timestamptz,timestamptz,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.performance_open_period_internal(uuid,timestamptz,timestamptz,numeric,jsonb) to service_role;
