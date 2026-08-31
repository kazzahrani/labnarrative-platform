create table if not exists public.trader_v2_command_gates (
  command_type text not null,
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  enabled boolean not null default false,
  note text null,
  updated_at timestamptz not null default now(),
  primary key (command_type, account_id)
);

create index if not exists trader_v2_command_gates_account_idx
  on public.trader_v2_command_gates(account_id, command_type);

alter table public.trader_v2_command_gates enable row level security;

revoke all on table public.trader_v2_command_gates from public, anon, authenticated;
grant select on table public.trader_v2_command_gates to service_role;

comment on table public.trader_v2_command_gates is
  'Fail-closed per-account Core V2 execute gates. Absence of a row is disabled. Enable only by explicit operator migration/change.';

create or replace function public.trader_v2_enforce_command_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'execute' then
    if not exists (
      select 1
      from public.trader_v2_command_gates g
      where g.command_type = new.command_type
        and g.account_id = new.account_id
        and g.enabled is true
    ) then
      raise exception 'core_v2_execute_disabled';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trader_v2_enforce_command_gate() from public, anon, authenticated;

drop trigger if exists trader_v2_commands_execute_gate on public.trader_v2_commands;
create trigger trader_v2_commands_execute_gate
before insert or update of mode, command_type, account_id
on public.trader_v2_commands
for each row
execute function public.trader_v2_enforce_command_gate();
