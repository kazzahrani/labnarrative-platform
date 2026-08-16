alter table public.intelligence_client_workspaces
  add column if not exists portal_activated_at timestamptz,
  add column if not exists portal_last_login_at timestamptz;

create table if not exists public.intelligence_client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  company_website text,
  avatar_initials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists intelligence_client_profiles_email_lower_idx
  on public.intelligence_client_profiles (lower(email));

create table if not exists public.intelligence_client_workspace_members (
  workspace_id uuid not null references public.intelligence_client_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists intelligence_client_workspace_members_user_idx
  on public.intelligence_client_workspace_members(user_id);

alter table public.intelligence_client_profiles enable row level security;
alter table public.intelligence_client_workspace_members enable row level security;

revoke all on table public.intelligence_client_profiles from anon, authenticated;
revoke all on table public.intelligence_client_workspace_members from anon, authenticated;

grant all on table public.intelligence_client_profiles to service_role;
grant all on table public.intelligence_client_workspace_members to service_role;

comment on table public.intelligence_client_profiles is 'Authenticated LabNarrative Intelligence client profile. Browser access is mediated by Edge Functions.';
comment on table public.intelligence_client_workspace_members is 'Maps authenticated Intelligence client users to paid workspaces. Supports future multi-user company accounts.';
comment on column public.intelligence_client_workspaces.portal_activated_at is 'When the paid workspace was linked to an authenticated client portal account.';
