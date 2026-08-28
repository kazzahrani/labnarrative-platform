create table if not exists public.trader_starter_seed_state (
  account_id uuid primary key references public.trader_accounts(id) on delete cascade,
  version integer not null default 1,
  seeded_at timestamptz not null default now()
);

alter table public.trader_starter_seed_state enable row level security;
revoke all on table public.trader_starter_seed_state from anon, authenticated;

insert into public.trader_starter_seed_state (account_id, version, seeded_at)
select distinct account_id, 1, now()
from public.trader_bots
where client_id like 'starter-demo-v1-%'
on conflict (account_id) do nothing;

create or replace function public.trader_seed_starter_paper_account_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_user_id is not null
     and new.status = 'active'
     and (new.mode = 'paper' or new.account_kind = 'paper')
     and not exists (
       select 1 from public.trader_starter_seed_state
       where account_id = new.id and version >= 1
     ) then
    perform public.trader_seed_starter_paper_account(new.id);
    insert into public.trader_starter_seed_state (account_id, version)
    values (new.id, 1)
    on conflict (account_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.trader_seed_starter_paper_account_trigger() from public;
