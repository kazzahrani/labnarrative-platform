create sequence if not exists public.trader_public_user_no_seq;

create table if not exists public.trader_public_users (
  owner_user_id uuid primary key,
  user_no bigint not null default nextval('public.trader_public_user_no_seq'),
  next_bot_no bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint trader_public_users_user_no_key unique (user_no),
  constraint trader_public_users_next_bot_no_check check (next_bot_no >= 1)
);
alter sequence public.trader_public_user_no_seq owned by public.trader_public_users.user_no;
alter table public.trader_public_users enable row level security;
revoke all on public.trader_public_users from public, anon, authenticated;

alter table public.trader_bots add column if not exists public_bot_no bigint;
alter table public.trader_trades add column if not exists public_trade_no bigint;

create table if not exists public.trader_public_bot_counters (
  bot_id uuid primary key references public.trader_bots(id) on delete cascade,
  next_trade_no bigint not null default 1,
  constraint trader_public_bot_counters_next_trade_no_check check (next_trade_no >= 1)
);
alter table public.trader_public_bot_counters enable row level security;
revoke all on public.trader_public_bot_counters from public, anon, authenticated;

with owners as (
  select owner_user_id, min(created_at) as first_created
  from public.trader_accounts
  where owner_user_id is not null
  group by owner_user_id
), ranked as (
  select owner_user_id,
         row_number() over (order by first_created, owner_user_id) as user_no
  from owners
)
insert into public.trader_public_users(owner_user_id, user_no, next_bot_no)
select owner_user_id, user_no, 1
from ranked
on conflict (owner_user_id) do nothing;

do $$
declare v_max bigint;
begin
  select max(user_no) into v_max from public.trader_public_users;
  if v_max is null then
    perform setval('public.trader_public_user_no_seq', 1, false);
  else
    perform setval('public.trader_public_user_no_seq', v_max, true);
  end if;
end $$;

with ranked as (
  select b.id,
         row_number() over (
           partition by a.owner_user_id
           order by b.created_at, b.id
         ) as public_bot_no
  from public.trader_bots b
  join public.trader_accounts a on a.id = b.account_id
  where a.owner_user_id is not null
)
update public.trader_bots b
set public_bot_no = r.public_bot_no
from ranked r
where b.id = r.id
  and b.public_bot_no is null;

update public.trader_public_users u
set next_bot_no = greatest(1, coalesce((
  select max(b.public_bot_no) + 1
  from public.trader_bots b
  join public.trader_accounts a on a.id = b.account_id
  where a.owner_user_id = u.owner_user_id
), 1));

with ranked as (
  select t.id,
         row_number() over (
           partition by t.bot_id
           order by coalesce(t.opened_at, t.created_at), t.id
         ) as public_trade_no
  from public.trader_trades t
  where t.bot_id is not null
)
update public.trader_trades t
set public_trade_no = r.public_trade_no
from ranked r
where t.id = r.id
  and t.public_trade_no is null;

insert into public.trader_public_bot_counters(bot_id, next_trade_no)
select b.id, greatest(1, coalesce(max(t.public_trade_no) + 1, 1))
from public.trader_bots b
left join public.trader_trades t on t.bot_id = b.id
group by b.id
on conflict (bot_id) do update
set next_trade_no = greatest(public.trader_public_bot_counters.next_trade_no, excluded.next_trade_no);

create unique index if not exists trader_trades_bot_public_trade_no_key
  on public.trader_trades(bot_id, public_trade_no)
  where bot_id is not null and public_trade_no is not null;

create or replace function public.trader_assign_public_bot_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_assigned bigint;
begin
  if new.public_bot_no is not null then return new; end if;
  select owner_user_id into v_owner from public.trader_accounts where id = new.account_id;
  if v_owner is null then return new; end if;
  insert into public.trader_public_users(owner_user_id) values (v_owner)
  on conflict (owner_user_id) do nothing;
  update public.trader_public_users
  set next_bot_no = next_bot_no + 1
  where owner_user_id = v_owner
  returning next_bot_no - 1 into v_assigned;
  new.public_bot_no := v_assigned;
  return new;
end;
$$;

revoke all on function public.trader_assign_public_bot_no() from public, anon, authenticated;

drop trigger if exists trader_assign_public_bot_no on public.trader_bots;
create trigger trader_assign_public_bot_no
before insert on public.trader_bots
for each row execute function public.trader_assign_public_bot_no();

create or replace function public.trader_assign_public_trade_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned bigint;
begin
  if new.public_trade_no is not null or new.bot_id is null then return new; end if;
  insert into public.trader_public_bot_counters(bot_id, next_trade_no)
  values (new.bot_id, 1)
  on conflict (bot_id) do nothing;
  update public.trader_public_bot_counters
  set next_trade_no = next_trade_no + 1
  where bot_id = new.bot_id
  returning next_trade_no - 1 into v_assigned;
  new.public_trade_no := v_assigned;
  return new;
end;
$$;

revoke all on function public.trader_assign_public_trade_no() from public, anon, authenticated;

drop trigger if exists trader_assign_public_trade_no on public.trader_trades;
create trigger trader_assign_public_trade_no
before insert on public.trader_trades
for each row execute function public.trader_assign_public_trade_no();

create or replace function public.trader_public_trade_id(p_trade_client_id text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select concat(u.user_no, '-', b.public_bot_no, '-', t.public_trade_no)
  from public.trader_trades t
  join public.trader_bots b on b.id = t.bot_id
  join public.trader_accounts a on a.id = t.account_id
  join public.trader_public_users u on u.owner_user_id = a.owner_user_id
  where t.client_id = p_trade_client_id
    and a.owner_user_id = auth.uid()
  limit 1
$$;
revoke all on function public.trader_public_trade_id(text) from public, anon;
grant execute on function public.trader_public_trade_id(text) to authenticated;

create or replace function public.trader_public_bot_id(p_bot_client_id text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select concat(u.user_no, '-', b.public_bot_no)
  from public.trader_bots b
  join public.trader_accounts a on a.id = b.account_id
  join public.trader_public_users u on u.owner_user_id = a.owner_user_id
  where b.client_id = p_bot_client_id
    and a.owner_user_id = auth.uid()
  limit 1
$$;
revoke all on function public.trader_public_bot_id(text) from public, anon;
grant execute on function public.trader_public_bot_id(text) to authenticated;
