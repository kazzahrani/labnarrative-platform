-- Make workspace bootstrap concurrency-safe and add private evidence storage.

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

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

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

insert into storage.buckets (id, name, public, file_size_limit)
values ('pvos-evidence','pvos-evidence',false,26214400)
on conflict (id) do update
set public=false, file_size_limit=26214400;

drop policy if exists "pvos evidence storage select" on storage.objects;
create policy "pvos evidence storage select"
on storage.objects
for select
to authenticated
using (
  bucket_id='pvos-evidence'
  and public.pvos_is_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "pvos evidence storage insert" on storage.objects;
create policy "pvos evidence storage insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='pvos-evidence'
  and public.pvos_is_member(((storage.foldername(name))[1])::uuid)
);
