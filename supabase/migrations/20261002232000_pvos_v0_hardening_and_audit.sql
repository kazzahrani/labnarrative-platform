-- PVOS V0 hardening, audit hooks, and authenticated workspace bootstrap

create index if not exists pvos_memberships_user_idx on public.pvos_memberships (user_id);
create index if not exists pvos_companies_org_idx on public.pvos_companies (organization_id);
create index if not exists pvos_products_company_idx on public.pvos_products (company_id);
create index if not exists pvos_obligations_product_idx on public.pvos_obligations (product_id);
create index if not exists pvos_tasks_product_idx on public.pvos_tasks (product_id);
create index if not exists pvos_tasks_obligation_idx on public.pvos_tasks (obligation_id);
create index if not exists pvos_tasks_owner_idx on public.pvos_tasks (owner_user_id);
create index if not exists pvos_tasks_reviewer_idx on public.pvos_tasks (reviewer_user_id);
create index if not exists pvos_evidence_task_idx on public.pvos_task_evidence (task_id);
create index if not exists pvos_routes_company_idx on public.pvos_approval_routes (company_id);
create index if not exists pvos_approval_steps_route_idx on public.pvos_approval_steps (route_id);
create index if not exists pvos_approvals_assignee_idx on public.pvos_task_approvals (assigned_user_id);
create index if not exists pvos_handovers_org_idx on public.pvos_handovers (organization_id);
create index if not exists pvos_handover_companies_company_idx on public.pvos_handover_companies (company_id);

create or replace function public.pvos_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.pvos_is_member(uuid) from anon;
grant execute on function public.pvos_is_member(uuid) to authenticated;

create or replace function public.pvos_bootstrap_workspace(workspace_name text default 'PVOS Workspace')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  existing_org uuid;
  new_org uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select organization_id into existing_org
  from public.pvos_memberships
  where user_id = uid
  order by created_at
  limit 1;

  if existing_org is not null then
    return existing_org;
  end if;

  insert into public.pvos_organizations(name)
  values (coalesce(nullif(trim(workspace_name), ''), 'PVOS Workspace'))
  returning id into new_org;

  insert into public.pvos_memberships(organization_id, user_id, role)
  values (new_org, uid, 'admin');

  return new_org;
end;
$$;

revoke all on function public.pvos_bootstrap_workspace(text) from public, anon;
grant execute on function public.pvos_bootstrap_workspace(text) to authenticated;

create or replace function public.pvos_audit_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  org_id uuid;
  company uuid;
  entity uuid;
begin
  if tg_op = 'DELETE' then
    row_data := null;
    previous_data := to_jsonb(old);
    org_id := old.organization_id;
    company := old.company_id;
    entity := old.id;
  else
    row_data := to_jsonb(new);
    previous_data := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    org_id := new.organization_id;
    company := new.company_id;
    entity := new.id;
  end if;

  insert into public.pvos_audit_events(
    organization_id, company_id, actor_user_id,
    entity_type, entity_id, event_type,
    before_data, after_data
  )
  values (
    org_id, company, auth.uid(),
    'task', entity, lower(tg_op),
    previous_data, row_data
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.pvos_audit_task_change() from public, anon, authenticated;

drop trigger if exists pvos_tasks_audit on public.pvos_tasks;
create trigger pvos_tasks_audit
after insert or update or delete on public.pvos_tasks
for each row execute function public.pvos_audit_task_change();

create or replace function public.pvos_audit_handover_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  org_id uuid;
  entity uuid;
begin
  if tg_op = 'DELETE' then
    row_data := null;
    previous_data := to_jsonb(old);
    org_id := old.organization_id;
    entity := old.id;
  else
    row_data := to_jsonb(new);
    previous_data := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    org_id := new.organization_id;
    entity := new.id;
  end if;

  insert into public.pvos_audit_events(
    organization_id, actor_user_id,
    entity_type, entity_id, event_type,
    before_data, after_data
  )
  values (
    org_id, auth.uid(),
    'handover', entity, lower(tg_op),
    previous_data, row_data
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.pvos_audit_handover_change() from public, anon, authenticated;

drop trigger if exists pvos_handovers_audit on public.pvos_handovers;
create trigger pvos_handovers_audit
after insert or update or delete on public.pvos_handovers
for each row execute function public.pvos_audit_handover_change();

create or replace function public.pvos_audit_approval_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  org_id uuid;
  company uuid;
  entity uuid;
  task_ref uuid;
begin
  if tg_op = 'DELETE' then
    row_data := null;
    previous_data := to_jsonb(old);
    entity := old.id;
    task_ref := old.task_id;
  else
    row_data := to_jsonb(new);
    previous_data := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    entity := new.id;
    task_ref := new.task_id;
  end if;

  select t.organization_id, t.company_id
  into org_id, company
  from public.pvos_tasks t
  where t.id = task_ref;

  if org_id is not null then
    insert into public.pvos_audit_events(
      organization_id, company_id, actor_user_id,
      entity_type, entity_id, event_type,
      before_data, after_data,
      metadata
    )
    values (
      org_id, company, auth.uid(),
      'approval', entity, lower(tg_op),
      previous_data, row_data,
      jsonb_build_object('task_id', task_ref)
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.pvos_audit_approval_change() from public, anon, authenticated;

drop trigger if exists pvos_task_approvals_audit on public.pvos_task_approvals;
create trigger pvos_task_approvals_audit
after insert or update or delete on public.pvos_task_approvals
for each row execute function public.pvos_audit_approval_change();
