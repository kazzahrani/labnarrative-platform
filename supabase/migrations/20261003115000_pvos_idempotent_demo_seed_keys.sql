alter table public.pvos_companies add column if not exists seed_key text;
alter table public.pvos_products add column if not exists seed_key text;
alter table public.pvos_obligations add column if not exists seed_key text;
alter table public.pvos_tasks add column if not exists seed_key text;
alter table public.pvos_task_evidence add column if not exists seed_key text;
alter table public.pvos_approval_routes add column if not exists seed_key text;
alter table public.pvos_task_approvals add column if not exists seed_key text;

create unique index if not exists pvos_companies_seed_key_unique
  on public.pvos_companies(organization_id,seed_key);
create unique index if not exists pvos_products_seed_key_unique
  on public.pvos_products(company_id,seed_key);
create unique index if not exists pvos_obligations_seed_key_unique
  on public.pvos_obligations(company_id,seed_key);
create unique index if not exists pvos_tasks_seed_key_unique
  on public.pvos_tasks(organization_id,seed_key);
create unique index if not exists pvos_task_evidence_seed_key_unique
  on public.pvos_task_evidence(task_id,seed_key);
create unique index if not exists pvos_approval_routes_seed_key_unique
  on public.pvos_approval_routes(company_id,seed_key);
create unique index if not exists pvos_task_approvals_seed_key_unique
  on public.pvos_task_approvals(task_id,seed_key);
