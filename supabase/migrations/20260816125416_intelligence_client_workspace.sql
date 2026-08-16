alter table public.intelligence_package_purchases
  add column if not exists source_report_id uuid;

create table if not exists public.intelligence_client_workspaces (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.intelligence_package_purchases(id) on delete cascade,
  access_token uuid not null unique default gen_random_uuid(),
  company_name text,
  company_website text,
  contact_name text,
  contact_email text,
  target_geography text,
  client_notes text,
  onboarding_status text not null default 'awaiting_details' check (onboarding_status in ('awaiting_details','collecting_products','ready_for_research','in_progress','complete')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_product_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.intelligence_client_workspaces(id) on delete cascade,
  position integer not null check (position > 0),
  product_name text,
  catalog_number text,
  product_url text,
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  client_notes text,
  status text not null default 'awaiting_product' check (status in ('awaiting_product','submitted','queued','researching','scientific_review','complete')),
  intelligence_report_id uuid,
  web_report_url text,
  pdf_report_url text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, position)
);

create index if not exists intelligence_client_workspaces_status_idx
  on public.intelligence_client_workspaces(onboarding_status, updated_at desc);
create index if not exists intelligence_product_requests_status_idx
  on public.intelligence_product_requests(status, updated_at desc);
create index if not exists intelligence_product_requests_workspace_idx
  on public.intelligence_product_requests(workspace_id, position);

alter table public.intelligence_client_workspaces enable row level security;
alter table public.intelligence_product_requests enable row level security;

revoke all on public.intelligence_client_workspaces from anon, authenticated;
revoke all on public.intelligence_product_requests from anon, authenticated;

grant all on public.intelligence_client_workspaces to service_role;
grant all on public.intelligence_product_requests to service_role;
