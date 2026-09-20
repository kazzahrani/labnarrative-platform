create schema if not exists private;

create table if not exists private.performance_plan_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  minimum_spot_balance_usd numeric(20,8) not null default 2500 check (minimum_spot_balance_usd >= 0),
  monthly_charge_cap_usd numeric(20,8) not null default 99 check (monthly_charge_cap_usd >= 0),
  settlement_quote_asset text not null default 'USDT' check (settlement_quote_asset ~ '^[A-Z0-9]{2,12}$'),
  updated_at timestamptz not null default now()
);

insert into private.performance_plan_config(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.performance_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'open'
    check (status in ('open','ineligible','finalizing','finalized','payment_due','paid','payment_failed','paused','void')),
  eligibility_spot_balance_usd numeric(20,8) not null default 0,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  minimum_spot_balance_usd numeric(20,8) not null default 2500,
  monthly_charge_cap_usd numeric(20,8) not null default 99,
  settlement_quote_asset text not null default 'USDT',
  net_pnl_quote numeric(24,8),
  charge_usd numeric(20,2),
  finalized_at timestamptz,
  payment_due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  check (eligibility_spot_balance_usd >= 0),
  check (minimum_spot_balance_usd >= 0),
  check (monthly_charge_cap_usd >= 0),
  unique (user_id, period_start)
);

create index if not exists performance_periods_user_status_idx
  on private.performance_periods(user_id, status, period_end desc);

create table if not exists private.performance_trade_marks (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references private.performance_periods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trading_trades(id) on delete restrict,
  connection_id uuid not null references public.exchange_connections(id) on delete restrict,
  pair text not null,
  baseline_reason text not null
    check (baseline_reason in ('period_start','period_rollover','trade_created','loaded_existing','manual_reloaded')),
  opening_cumulative_pnl_quote numeric(24,8) not null,
  opening_mark_price numeric(30,12) not null check (opening_mark_price > 0),
  opening_marked_at timestamptz not null,
  closing_cumulative_pnl_quote numeric(24,8),
  closing_mark_price numeric(30,12),
  closing_marked_at timestamptz,
  closing_reason text
    check (closing_reason is null or closing_reason in ('period_end','trade_closed','management_cancelled','exchange_disconnect','manual_crystallization')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, trade_id),
  check (
    (closing_cumulative_pnl_quote is null and closing_mark_price is null and closing_marked_at is null and closing_reason is null)
    or
    (closing_cumulative_pnl_quote is not null and closing_mark_price is not null and closing_marked_at is not null and closing_reason is not null)
  )
);

create index if not exists performance_trade_marks_period_open_idx
  on private.performance_trade_marks(period_id, closing_marked_at)
  where closing_marked_at is null;

create index if not exists performance_trade_marks_trade_idx
  on private.performance_trade_marks(trade_id, opening_marked_at desc);

comment on table private.performance_periods is
  'LabNarrative Performance monthly accounting periods. Non-enforcing until private.performance_plan_config.enabled is true.';
comment on table private.performance_trade_marks is
  'Per-period cumulative P&L baselines and closing marks. Period contribution = closing cumulative P&L - opening cumulative P&L.';
comment on column private.performance_trade_marks.opening_cumulative_pnl_quote is
  'For period-start/rollover/loaded trades, baseline is current cumulative P&L. For a newly created LN trade, baseline is zero so entry fees and all subsequent P&L count.';
comment on column private.performance_periods.charge_usd is
  'Final charge = round(min(max(net period P&L,0), monthly cap), 2). No carry-forward.';

grant usage on schema private to service_role;
grant select, insert, update, delete on private.performance_plan_config to service_role;
grant select, insert, update, delete on private.performance_periods to service_role;
grant select, insert, update, delete on private.performance_trade_marks to service_role;

create or replace function public.performance_trade_cumulative_pnl_internal(
  p_trade_id uuid,
  p_mark_price numeric
)
returns numeric
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    coalesce(t.realized_pnl, 0)
    + case
        when t.status = 'active'
          then coalesce(t.quantity, 0) * (p_mark_price - coalesce(t.average_price, p_mark_price))
        else 0
      end
  from public.trading_trades t
  where t.id = p_trade_id
    and p_mark_price is not null
    and p_mark_price > 0
$$;

comment on function public.performance_trade_cumulative_pnl_internal(uuid,numeric) is
  'Internal Performance accounting helper. realized_pnl already contains trading fees; do not subtract fees_quote again.';

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
set search_path = pg_catalog, public, private
as $$
declare
  v_config private.performance_plan_config%rowtype;
  v_row private.performance_periods%rowtype;
begin
  if p_user_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'performance_period_invalid';
  end if;
  if p_spot_balance_usd is null or p_spot_balance_usd < 0 then
    raise exception 'performance_balance_invalid';
  end if;

  select * into v_config
  from private.performance_plan_config
  where singleton = true;

  insert into private.performance_periods(
    user_id, period_start, period_end, status,
    eligibility_spot_balance_usd, eligibility_snapshot,
    minimum_spot_balance_usd, monthly_charge_cap_usd, settlement_quote_asset
  )
  values(
    p_user_id, p_period_start, p_period_end,
    case when p_spot_balance_usd >= v_config.minimum_spot_balance_usd then 'open' else 'ineligible' end,
    p_spot_balance_usd, coalesce(p_eligibility_snapshot, '{}'::jsonb),
    v_config.minimum_spot_balance_usd, v_config.monthly_charge_cap_usd, v_config.settlement_quote_asset
  )
  on conflict (user_id, period_start) do update
    set eligibility_spot_balance_usd = excluded.eligibility_spot_balance_usd,
        eligibility_snapshot = excluded.eligibility_snapshot,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.performance_register_trade_mark_internal(
  p_period_id uuid,
  p_trade_id uuid,
  p_mark_price numeric,
  p_marked_at timestamptz,
  p_baseline_reason text,
  p_new_ln_trade boolean default false
)
returns private.performance_trade_marks
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_period private.performance_periods%rowtype;
  v_trade public.trading_trades%rowtype;
  v_open numeric;
  v_row private.performance_trade_marks%rowtype;
begin
  select * into v_period from private.performance_periods where id = p_period_id;
  if not found or v_period.status <> 'open' then raise exception 'performance_period_not_open'; end if;

  select * into v_trade from public.trading_trades where id = p_trade_id and user_id = v_period.user_id;
  if not found then raise exception 'performance_trade_not_found'; end if;
  if v_trade.execution_mode <> 'live' then raise exception 'performance_live_trade_required'; end if;
  if p_mark_price is null or p_mark_price <= 0 then raise exception 'performance_mark_price_invalid'; end if;
  if p_baseline_reason not in ('period_start','period_rollover','trade_created','loaded_existing','manual_reloaded') then
    raise exception 'performance_baseline_reason_invalid';
  end if;

  v_open := case
    when p_new_ln_trade then 0
    else public.performance_trade_cumulative_pnl_internal(v_trade.id, p_mark_price)
  end;

  insert into private.performance_trade_marks(
    period_id,user_id,trade_id,connection_id,pair,baseline_reason,
    opening_cumulative_pnl_quote,opening_mark_price,opening_marked_at
  )
  values(
    v_period.id,v_period.user_id,v_trade.id,v_trade.connection_id,v_trade.pair,p_baseline_reason,
    coalesce(v_open,0),p_mark_price,coalesce(p_marked_at,now())
  )
  on conflict (period_id,trade_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from private.performance_trade_marks
    where period_id = p_period_id and trade_id = p_trade_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.performance_close_trade_mark_internal(
  p_period_id uuid,
  p_trade_id uuid,
  p_mark_price numeric,
  p_marked_at timestamptz,
  p_closing_reason text
)
returns private.performance_trade_marks
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_mark private.performance_trade_marks%rowtype;
  v_close numeric;
begin
  select * into v_mark
  from private.performance_trade_marks
  where period_id = p_period_id and trade_id = p_trade_id
  for update;

  if not found then raise exception 'performance_trade_mark_not_found'; end if;
  if v_mark.closing_marked_at is not null then return v_mark; end if;
  if p_mark_price is null or p_mark_price <= 0 then raise exception 'performance_mark_price_invalid'; end if;
  if p_closing_reason not in ('period_end','trade_closed','management_cancelled','exchange_disconnect','manual_crystallization') then
    raise exception 'performance_closing_reason_invalid';
  end if;

  v_close := public.performance_trade_cumulative_pnl_internal(p_trade_id,p_mark_price);
  if v_close is null then raise exception 'performance_cumulative_pnl_unavailable'; end if;

  update private.performance_trade_marks
  set closing_cumulative_pnl_quote = v_close,
      closing_mark_price = p_mark_price,
      closing_marked_at = coalesce(p_marked_at,now()),
      closing_reason = p_closing_reason,
      updated_at = now()
  where id = v_mark.id
  returning * into v_mark;

  return v_mark;
end;
$$;

create or replace function public.performance_finalize_period_internal(
  p_period_id uuid
)
returns private.performance_periods
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_period private.performance_periods%rowtype;
  v_net numeric;
  v_charge numeric;
begin
  select * into v_period
  from private.performance_periods
  where id = p_period_id
  for update;

  if not found then raise exception 'performance_period_not_found'; end if;
  if v_period.status not in ('open','finalizing') then return v_period; end if;

  if exists (
    select 1 from private.performance_trade_marks
    where period_id = p_period_id and closing_marked_at is null
  ) then
    raise exception 'performance_open_marks_remaining';
  end if;

  select coalesce(sum(closing_cumulative_pnl_quote - opening_cumulative_pnl_quote),0)
  into v_net
  from private.performance_trade_marks
  where period_id = p_period_id;

  v_charge := round(least(greatest(v_net,0),v_period.monthly_charge_cap_usd),2);

  update private.performance_periods
  set status = 'finalized',
      net_pnl_quote = v_net,
      charge_usd = v_charge,
      finalized_at = now(),
      updated_at = now()
  where id = p_period_id
  returning * into v_period;

  return v_period;
end;
$$;

revoke all on function public.performance_trade_cumulative_pnl_internal(uuid,numeric) from public, anon, authenticated;
revoke all on function public.performance_open_period_internal(uuid,timestamptz,timestamptz,numeric,jsonb) from public, anon, authenticated;
revoke all on function public.performance_register_trade_mark_internal(uuid,uuid,numeric,timestamptz,text,boolean) from public, anon, authenticated;
revoke all on function public.performance_close_trade_mark_internal(uuid,uuid,numeric,timestamptz,text) from public, anon, authenticated;
revoke all on function public.performance_finalize_period_internal(uuid) from public, anon, authenticated;

grant execute on function public.performance_trade_cumulative_pnl_internal(uuid,numeric) to service_role;
grant execute on function public.performance_open_period_internal(uuid,timestamptz,timestamptz,numeric,jsonb) to service_role;
grant execute on function public.performance_register_trade_mark_internal(uuid,uuid,numeric,timestamptz,text,boolean) to service_role;
grant execute on function public.performance_close_trade_mark_internal(uuid,uuid,numeric,timestamptz,text) to service_role;
grant execute on function public.performance_finalize_period_internal(uuid) to service_role;
