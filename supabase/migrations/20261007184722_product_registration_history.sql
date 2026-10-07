-- Existing registration values remain user-recorded, with no inferred authority verification.
alter table public.pvos_products
  add column if not exists registration_reference text,
  add column if not exists registration_change_reason text;

create or replace function public.pvos_audit_product_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  actor_email text;
begin
  if tg_op = 'UPDATE' and
    row(new.registration_status,new.sfda_registration_number,new.registration_reference)
    is not distinct from row(old.registration_status,old.sfda_registration_number,old.registration_reference) then
    return new;
  end if;
  select c.organization_id into org from public.pvos_companies c where c.id=new.company_id;
  if auth.uid() is not null and not exists (
    select 1 from public.pvos_memberships m where m.organization_id=org and m.user_id=auth.uid()
  ) then raise exception 'Workspace membership required'; end if;
  if tg_op='UPDATE' and nullif(btrim(new.registration_change_reason),'') is null then
    raise exception 'A reason is required for a registration change';
  end if;
  select email into actor_email from auth.users where id=auth.uid();
  insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata)
  values(org,new.company_id,auth.uid(),'product_registration',new.id,lower(tg_op),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),
    jsonb_build_object('actor_email',actor_email,'reason',new.registration_change_reason,'recording_basis','user_recorded'));
  return new;
end;
$$;
revoke all on function public.pvos_audit_product_registration() from public,anon,authenticated;
create trigger pvos_products_registration_audit after insert or update on public.pvos_products
for each row execute function public.pvos_audit_product_registration();
