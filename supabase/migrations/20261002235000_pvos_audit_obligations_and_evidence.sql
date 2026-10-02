-- Audit evidence and obligation changes for inspection-ready history.

create or replace function public.pvos_audit_obligation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  company uuid;
  org_id uuid;
  entity uuid;
begin
  if tg_op = 'DELETE' then
    row_data := null; previous_data := to_jsonb(old); company := old.company_id; entity := old.id;
  else
    row_data := to_jsonb(new); previous_data := case when tg_op='UPDATE' then to_jsonb(old) else null end; company := new.company_id; entity := new.id;
  end if;

  select organization_id into org_id from public.pvos_companies where id=company;
  if org_id is not null then
    insert into public.pvos_audit_events(
      organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data
    ) values (
      org_id,company,auth.uid(),'obligation',entity,lower(tg_op),previous_data,row_data
    );
  end if;
  return coalesce(new,old);
end;
$$;

revoke all on function public.pvos_audit_obligation_change() from public,anon,authenticated;

drop trigger if exists pvos_obligations_audit on public.pvos_obligations;
create trigger pvos_obligations_audit
after insert or update or delete on public.pvos_obligations
for each row execute function public.pvos_audit_obligation_change();

create or replace function public.pvos_audit_evidence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  task_ref uuid;
  org_id uuid;
  company uuid;
  entity uuid;
begin
  if tg_op = 'DELETE' then
    row_data := null; previous_data := to_jsonb(old); task_ref := old.task_id; entity := old.id;
  else
    row_data := to_jsonb(new); previous_data := case when tg_op='UPDATE' then to_jsonb(old) else null end; task_ref := new.task_id; entity := new.id;
  end if;

  select organization_id,company_id into org_id,company
  from public.pvos_tasks where id=task_ref;

  if org_id is not null then
    insert into public.pvos_audit_events(
      organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata
    ) values (
      org_id,company,auth.uid(),'evidence',entity,lower(tg_op),previous_data,row_data,jsonb_build_object('task_id',task_ref)
    );
  end if;
  return coalesce(new,old);
end;
$$;

revoke all on function public.pvos_audit_evidence_change() from public,anon,authenticated;

drop trigger if exists pvos_task_evidence_audit on public.pvos_task_evidence;
create trigger pvos_task_evidence_audit
after insert or update or delete on public.pvos_task_evidence
for each row execute function public.pvos_audit_evidence_change();
