-- PVOS V0 core schema
-- Prepared for a dedicated Supabase project. Do not apply to unrelated LabNarrative databases.

create extension if not exists pgcrypto;

create table if not exists public.pvos_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pvos_memberships (
  organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','qppv','deputy_qppv','pv_specialist','quality','manager','client_representative')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.pvos_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
  name text not null,
  contract_scope text,
  qppv_user_id uuid references auth.users(id),
  deputy_user_id uuid references auth.users(id),
  status text not null default 'active' check (status in ('active','pre_registration','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pvos_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.pvos_companies(id) on delete cascade,
  brand_name text not null,
  active_ingredient text,
  registration_status text,
  sfda_registration_number text,
  rmp_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pvos_obligations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.pvos_companies(id) on delete cascade,
  product_id uuid references public.pvos_products(id) on delete cascade,
  activity_type text not null,
  title text not null,
  responsibility text not null default 'organization' check (responsibility in ('organization','client','shared')),
  owner_user_id uuid references auth.users(id),
  reviewer_user_id uuid references auth.users(id),
  cadence text not null default 'event' check (cadence in ('daily','weekly','monthly','quarterly','semiannual','annual','event')),
  cadence_config jsonb not null default '{}'::jsonb,
  evidence_required boolean not null default true,
  active boolean not null default true,
  source_type text,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pvos_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
  company_id uuid not null references public.pvos_companies(id) on delete cascade,
  product_id uuid references public.pvos_products(id) on delete set null,
  obligation_id uuid references public.pvos_obligations(id) on delete set null,
  title text not null,
  activity_type text not null,
  source text not null default 'manual' check (source in ('manual','recurring','sfda_event','handover','system')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','awaiting_review','awaiting_external','complete','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  owner_user_id uuid references auth.users(id),
  reviewer_user_id uuid references auth.users(id),
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pvos_tasks_org_due_idx on public.pvos_tasks (organization_id, due_at);
create index if not exists pvos_tasks_company_status_idx on public.pvos_tasks (company_id, status);
create index if not exists pvos_obligations_company_idx on public.pvos_obligations (company_id, active);

create table if not exists public.pvos_task_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.pvos_tasks(id) on delete cascade,
  evidence_type text not null default 'document',
  file_path text,
  external_url text,
  title text not null,
  version text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.pvos_approval_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.pvos_companies(id) on delete cascade,
  name text not null,
  activity_type text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pvos_approval_steps (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.pvos_approval_routes(id) on delete cascade,
  position integer not null check (position > 0),
  role text,
  assignee_user_id uuid references auth.users(id),
  unique (route_id, position)
);

create table if not exists public.pvos_task_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.pvos_tasks(id) on delete cascade,
  route_id uuid references public.pvos_approval_routes(id) on delete set null,
  step_position integer not null,
  assigned_user_id uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','in_review','approved','rejected','skipped')),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  comment text
);

create index if not exists pvos_task_approvals_task_idx on public.pvos_task_approvals (task_id, step_position);

create table if not exists public.pvos_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
  qppv_user_id uuid not null references auth.users(id),
  deputy_user_id uuid not null references auth.users(id),
  leave_start date not null,
  leave_end date not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','active','handback_pending','closed')),
  accepted_at timestamptz,
  handback_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pvos_handover_companies (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.pvos_handovers(id) on delete cascade,
  company_id uuid not null references public.pvos_companies(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  deputy_acknowledged_at timestamptz,
  qppv_handback_acknowledged_at timestamptz,
  unique (handover_id, company_id)
);

create table if not exists public.pvos_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
  company_id uuid references public.pvos_companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pvos_audit_org_created_idx on public.pvos_audit_events (organization_id, created_at desc);
create index if not exists pvos_audit_entity_idx on public.pvos_audit_events (entity_type, entity_id, created_at desc);

create or replace function public.pvos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pvos_companies_touch on public.pvos_companies;
create trigger pvos_companies_touch before update on public.pvos_companies
for each row execute function public.pvos_touch_updated_at();

drop trigger if exists pvos_products_touch on public.pvos_products;
create trigger pvos_products_touch before update on public.pvos_products
for each row execute function public.pvos_touch_updated_at();

drop trigger if exists pvos_obligations_touch on public.pvos_obligations;
create trigger pvos_obligations_touch before update on public.pvos_obligations
for each row execute function public.pvos_touch_updated_at();

drop trigger if exists pvos_tasks_touch on public.pvos_tasks;
create trigger pvos_tasks_touch before update on public.pvos_tasks
for each row execute function public.pvos_touch_updated_at();

create or replace function public.pvos_is_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pvos_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
  );
$$;

alter table public.pvos_organizations enable row level security;
alter table public.pvos_memberships enable row level security;
alter table public.pvos_companies enable row level security;
alter table public.pvos_products enable row level security;
alter table public.pvos_obligations enable row level security;
alter table public.pvos_tasks enable row level security;
alter table public.pvos_task_evidence enable row level security;
alter table public.pvos_approval_routes enable row level security;
alter table public.pvos_approval_steps enable row level security;
alter table public.pvos_task_approvals enable row level security;
alter table public.pvos_handovers enable row level security;
alter table public.pvos_handover_companies enable row level security;
alter table public.pvos_audit_events enable row level security;

create policy "pvos organizations member read" on public.pvos_organizations
for select using (public.pvos_is_member(id));

create policy "pvos memberships own org read" on public.pvos_memberships
for select using (public.pvos_is_member(organization_id));

create policy "pvos companies member all" on public.pvos_companies
for all using (public.pvos_is_member(organization_id))
with check (public.pvos_is_member(organization_id));

create policy "pvos products member all" on public.pvos_products
for all using (
  exists (select 1 from public.pvos_companies c where c.id = company_id and public.pvos_is_member(c.organization_id))
)
with check (
  exists (select 1 from public.pvos_companies c where c.id = company_id and public.pvos_is_member(c.organization_id))
);

create policy "pvos obligations member all" on public.pvos_obligations
for all using (
  exists (select 1 from public.pvos_companies c where c.id = company_id and public.pvos_is_member(c.organization_id))
)
with check (
  exists (select 1 from public.pvos_companies c where c.id = company_id and public.pvos_is_member(c.organization_id))
);

create policy "pvos tasks member all" on public.pvos_tasks
for all using (public.pvos_is_member(organization_id))
with check (public.pvos_is_member(organization_id));

create policy "pvos evidence member all" on public.pvos_task_evidence
for all using (
  exists (select 1 from public.pvos_tasks t where t.id = task_id and public.pvos_is_member(t.organization_id))
)
with check (
  exists (select 1 from public.pvos_tasks t where t.id = task_id and public.pvos_is_member(t.organization_id))
);

create policy "pvos routes member all" on public.pvos_approval_routes
for all using (
  exists (select 1 from public.pvos_companies c where c.id = company_id and public.pvos_is_member(c.organization_id))
)
with check (
  exists (select 1 from public.pvos_companies c where c.id = company_id and public.pvos_is_member(c.organization_id))
);

create policy "pvos route steps member all" on public.pvos_approval_steps
for all using (
  exists (
    select 1 from public.pvos_approval_routes r
    join public.pvos_companies c on c.id = r.company_id
    where r.id = route_id and public.pvos_is_member(c.organization_id)
  )
)
with check (
  exists (
    select 1 from public.pvos_approval_routes r
    join public.pvos_companies c on c.id = r.company_id
    where r.id = route_id and public.pvos_is_member(c.organization_id)
  )
);

create policy "pvos approvals member all" on public.pvos_task_approvals
for all using (
  exists (select 1 from public.pvos_tasks t where t.id = task_id and public.pvos_is_member(t.organization_id))
)
with check (
  exists (select 1 from public.pvos_tasks t where t.id = task_id and public.pvos_is_member(t.organization_id))
);

create policy "pvos handovers member all" on public.pvos_handovers
for all using (public.pvos_is_member(organization_id))
with check (public.pvos_is_member(organization_id));

create policy "pvos handover companies member all" on public.pvos_handover_companies
for all using (
  exists (select 1 from public.pvos_handovers h where h.id = handover_id and public.pvos_is_member(h.organization_id))
)
with check (
  exists (select 1 from public.pvos_handovers h where h.id = handover_id and public.pvos_is_member(h.organization_id))
);

create policy "pvos audit member read" on public.pvos_audit_events
for select using (public.pvos_is_member(organization_id));

-- Audit events are intended to be append-only from controlled application code.
