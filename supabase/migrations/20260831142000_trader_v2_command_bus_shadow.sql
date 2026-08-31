create table if not exists public.trader_v2_commands (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  account_id uuid not null references public.trader_accounts(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  command_type text not null,
  target_type text not null,
  target_id text null,
  payload jsonb not null default '{}'::jsonb,
  mode text not null default 'shadow',
  status text not null default 'received',
  validation jsonb null,
  result jsonb null,
  error_code text null,
  requested_at timestamptz not null default now(),
  validated_at timestamptz null,
  started_at timestamptz null,
  finished_at timestamptz null,
  constraint trader_v2_commands_idempotency_key_length check (char_length(idempotency_key) between 8 and 160),
  constraint trader_v2_commands_mode_check check (mode in ('shadow','execute')),
  constraint trader_v2_commands_status_check check (status in ('received','validating','shadow_validated','queued','running','succeeded','failed','rejected','cancelled')),
  constraint trader_v2_commands_target_check check (target_type in ('system','automation','position','connection')),
  constraint trader_v2_commands_type_check check (command_type in ('system.preflight','automation.set_status','position.update_exit_plan','position.close','position.add_funds')),
  constraint trader_v2_commands_owner_idempotency_unique unique (owner_user_id,idempotency_key)
);

create index if not exists trader_v2_commands_account_requested_idx
  on public.trader_v2_commands(account_id,requested_at desc);
create index if not exists trader_v2_commands_status_requested_idx
  on public.trader_v2_commands(status,requested_at asc);
create index if not exists trader_v2_commands_target_idx
  on public.trader_v2_commands(account_id,target_type,target_id,requested_at desc);

create table if not exists public.trader_v2_command_events (
  id bigint generated always as identity primary key,
  command_id uuid not null references public.trader_v2_commands(id) on delete cascade,
  owner_user_id uuid not null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trader_v2_command_events_command_idx
  on public.trader_v2_command_events(command_id,created_at asc);
create index if not exists trader_v2_command_events_owner_idx
  on public.trader_v2_command_events(owner_user_id,created_at desc);

alter table public.trader_v2_commands enable row level security;
alter table public.trader_v2_command_events enable row level security;

revoke all on table public.trader_v2_commands from anon, authenticated;
revoke all on table public.trader_v2_command_events from anon, authenticated;

grant all on table public.trader_v2_commands to service_role;
grant all on table public.trader_v2_command_events to service_role;
grant usage, select on sequence public.trader_v2_command_events_id_seq to service_role;

comment on table public.trader_v2_commands is 'Core V2 canonical command envelope. Execute mode remains disabled until explicitly enabled by the command worker.';
comment on table public.trader_v2_command_events is 'Append-only audit events for Core V2 commands.';
