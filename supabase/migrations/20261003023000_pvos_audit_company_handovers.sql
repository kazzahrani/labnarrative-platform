-- Audit per-company QPPV handover acknowledgements and handbacks.

create or replace function public.pvos_audit_handover_company_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  previous_data jsonb;
  handover_ref uuid;
  company_ref uuid;
  org_id uuid;
  entity uuid;
begin
  if tg_op='DELETE' then
    row_data := null;
    previous_data := to_jsonb(old);
    handover_ref := old.handover_id;
    company_ref := old.company_id;
    entity := old.id;
  else
    row_data := to_jsonb(new);
    previous_data := case when tg_op='UPDATE' then to_jsonb(old) else null end;
    handover_ref := new.handover_id;
    company_ref := new.company_id;
    entity := new.id;
  end if;

  select organization_id into org_id
  from public.pvos_handovers
  where id=handover_ref;

  if org_id is not null then
    insert into public.pvos_audit_events(
      organization_id, company_id, actor_user_id, entity_type, entity_id,
      event_type, before_data, after_data, metadata
    ) values (
      org_id, company_ref, auth.uid(), 'handover_company', entity,
      lower(tg_op), previous_data, row_data,
      jsonb_build_object('handover_id',handover_ref)
    );
  end if;

  return coalesce(new,old);
end;
$$;

revoke all on function public.pvos_audit_handover_company_change() from public,anon,authenticated;

drop trigger if exists pvos_handover_companies_audit on public.pvos_handover_companies;
create trigger pvos_handover_companies_audit
after insert or update or delete on public.pvos_handover_companies
for each row execute function public.pvos_audit_handover_company_change();
