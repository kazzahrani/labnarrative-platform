create or replace function public.prefill_intelligence_workspace_company_from_report()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  snapshot jsonb;
begin
  select coalesce(provider_metadata -> 'source_report_snapshot', '{}'::jsonb)
    into snapshot
  from public.intelligence_package_purchases
  where id = new.purchase_id;

  if nullif(btrim(coalesce(new.company_name, '')), '') is null then
    new.company_name := nullif(btrim(coalesce(snapshot ->> 'companyName', '')), '');
  end if;

  if nullif(btrim(coalesce(new.company_website, '')), '') is null then
    new.company_website := nullif(btrim(coalesce(snapshot ->> 'companyWebsite', '')), '');
  end if;

  return new;
end;
$$;

drop trigger if exists prefill_intelligence_workspace_company_from_report on public.intelligence_client_workspaces;
create trigger prefill_intelligence_workspace_company_from_report
before insert on public.intelligence_client_workspaces
for each row execute function public.prefill_intelligence_workspace_company_from_report();

update public.intelligence_client_workspaces w
set
  company_name = coalesce(nullif(btrim(w.company_name), ''), nullif(btrim(coalesce(p.provider_metadata -> 'source_report_snapshot' ->> 'companyName', '')), '')),
  company_website = coalesce(nullif(btrim(w.company_website), ''), nullif(btrim(coalesce(p.provider_metadata -> 'source_report_snapshot' ->> 'companyWebsite', '')), '')),
  updated_at = now()
from public.intelligence_package_purchases p
where p.id = w.purchase_id
  and p.source_report_id is not null
  and (
    nullif(btrim(coalesce(w.company_name, '')), '') is null
    or nullif(btrim(coalesce(w.company_website, '')), '') is null
  );
