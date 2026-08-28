create table if not exists public.trader_strategy_position_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  bot_id uuid not null references public.trader_bots(id) on delete cascade,
  pair text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (bot_id, pair)
);

create index if not exists trader_strategy_position_reservations_expires_idx
  on public.trader_strategy_position_reservations (expires_at);

alter table public.trader_strategy_position_reservations enable row level security;

create or replace function public.trader_reserve_strategy_position_slot(
  p_bot_id uuid,
  p_account_id uuid,
  p_pair text,
  p_max_positions integer,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean := false;
  v_reserved boolean := false;
  v_count integer := 0;
  v_lease integer := greatest(15, least(coalesce(p_lease_seconds, 90), 300));
begin
  if p_bot_id is null or p_account_id is null or nullif(trim(p_pair), '') is null then
    raise exception 'invalid_strategy_position_reservation';
  end if;
  if p_max_positions is null or p_max_positions < 1 then
    raise exception 'invalid_strategy_position_limit';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bot_id::text, 0));

  if not exists (
    select 1 from public.trader_bots b
    where b.id = p_bot_id and b.account_id = p_account_id
  ) then
    raise exception 'strategy_not_found';
  end if;

  delete from public.trader_strategy_position_reservations r
  where r.bot_id = p_bot_id
    and (
      r.expires_at <= now()
      or exists (
        select 1 from public.trader_trades t
        where t.bot_id = p_bot_id
          and t.pair = r.pair
          and t.status in ('Active', 'Closing')
      )
    );

  select exists (
    select 1 from public.trader_trades t
    where t.bot_id = p_bot_id
      and t.pair = p_pair
      and t.status in ('Active', 'Closing')
  ) into v_active;

  if v_active then
    return jsonb_build_object(
      'allowed', true,
      'existingPosition', true,
      'activePositions', (
        select count(*) from public.trader_trades t
        where t.bot_id = p_bot_id and t.status in ('Active', 'Closing')
      ),
      'maxOpenPositions', p_max_positions
    );
  end if;

  select exists (
    select 1 from public.trader_strategy_position_reservations r
    where r.bot_id = p_bot_id
      and r.pair = p_pair
      and r.expires_at > now()
  ) into v_reserved;

  if v_reserved then
    update public.trader_strategy_position_reservations
    set expires_at = now() + make_interval(secs => v_lease)
    where bot_id = p_bot_id and pair = p_pair;

    return jsonb_build_object(
      'allowed', true,
      'existingReservation', true,
      'maxOpenPositions', p_max_positions
    );
  end if;

  select count(*) into v_count
  from (
    select t.pair
    from public.trader_trades t
    where t.bot_id = p_bot_id
      and t.status in ('Active', 'Closing')
    union
    select r.pair
    from public.trader_strategy_position_reservations r
    where r.bot_id = p_bot_id
      and r.expires_at > now()
  ) slots;

  if v_count >= p_max_positions then
    return jsonb_build_object(
      'allowed', false,
      'activePositions', v_count,
      'maxOpenPositions', p_max_positions
    );
  end if;

  insert into public.trader_strategy_position_reservations (
    account_id, bot_id, pair, expires_at
  ) values (
    p_account_id, p_bot_id, p_pair, now() + make_interval(secs => v_lease)
  )
  on conflict (bot_id, pair) do update
    set account_id = excluded.account_id,
        expires_at = excluded.expires_at;

  return jsonb_build_object(
    'allowed', true,
    'reserved', true,
    'activePositions', v_count,
    'maxOpenPositions', p_max_positions
  );
end;
$$;

revoke all on function public.trader_reserve_strategy_position_slot(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.trader_reserve_strategy_position_slot(uuid, uuid, text, integer, integer) to service_role;

revoke all on public.trader_strategy_position_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.trader_strategy_position_reservations to service_role;
