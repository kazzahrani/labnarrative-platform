create or replace function public.client_onboarding_storage_path_valid(p_path text)
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.sales_client_onboarding o
    where o.share_token::text = split_part(p_path,'/',2)
      and split_part(p_path,'/',1)='client-onboarding'
      and o.link_enabled=true
      and o.status <> 'completed'
  );
$$;

create or replace function public.sales_client_onboarding_register_asset(
  p_token uuid,p_kind text,p_label text,p_storage_path text,p_public_url text,p_original_filename text,p_mime_type text,p_file_size bigint
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_client_onboarding%rowtype; a public.sales_client_onboarding_assets%rowtype;
begin
  select * into v from public.sales_client_onboarding where share_token=p_token and link_enabled=true;
  if not found then return jsonb_build_object('error','Onboarding link not found or disabled'); end if;
  if v.status='completed' then return jsonb_build_object('error','This onboarding record is complete'); end if;
  if p_kind not in ('logo','portrait','team_photo','lab_photo','research_image','other') then return jsonb_build_object('error','Invalid image type'); end if;
  if p_storage_path not like 'client-onboarding/'||p_token::text||'/%' then return jsonb_build_object('error','Invalid storage path'); end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','image/gif') then return jsonb_build_object('error','Unsupported image type'); end if;
  if p_file_size is null or p_file_size < 1 or p_file_size > 15728640 then return jsonb_build_object('error','Image must be 15 MB or smaller'); end if;
  insert into public.sales_client_onboarding_assets(onboarding_id,prospect_id,kind,label,storage_path,public_url,original_filename,mime_type,file_size)
  values(v.id,v.prospect_id,p_kind,left(coalesce(p_label,''),300),p_storage_path,left(p_public_url,3000),left(coalesce(p_original_filename,''),500),p_mime_type,p_file_size)
  returning * into a;
  if p_kind='logo' and coalesce(v.logo_url,'')='' then update public.sales_client_onboarding set logo_url=a.public_url,updated_at=now() where id=v.id; end if;
  return jsonb_build_object('ok',true,'asset',to_jsonb(a));
exception when unique_violation then
  return jsonb_build_object('error','This image is already registered');
end;
$$;

create or replace function public.sales_client_onboarding_remove_asset(p_token uuid,p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.sales_client_onboarding%rowtype; a public.sales_client_onboarding_assets%rowtype;
begin
  select * into v from public.sales_client_onboarding where share_token=p_token and link_enabled=true;
  if not found then return jsonb_build_object('error','Onboarding link not found or disabled'); end if;
  if v.status='completed' then return jsonb_build_object('error','This onboarding record is complete'); end if;
  select * into a from public.sales_client_onboarding_assets where id=p_asset_id and onboarding_id=v.id;
  if not found then return jsonb_build_object('error','Image not found'); end if;
  delete from public.sales_client_onboarding_assets where id=a.id;
  if v.logo_url=a.public_url then update public.sales_client_onboarding set logo_url='',updated_at=now() where id=v.id; end if;
  return jsonb_build_object('ok',true,'storage_path',a.storage_path);
end;
$$;

revoke all on function public.client_onboarding_storage_path_valid(text) from public;
grant execute on function public.client_onboarding_storage_path_valid(text) to anon,authenticated,service_role;
revoke all on function public.sales_client_onboarding_register_asset(uuid,text,text,text,text,text,text,bigint) from public;
grant execute on function public.sales_client_onboarding_register_asset(uuid,text,text,text,text,text,text,bigint) to anon,authenticated;
revoke all on function public.sales_client_onboarding_remove_asset(uuid,uuid) from public;
grant execute on function public.sales_client_onboarding_remove_asset(uuid,uuid) to anon,authenticated;

drop policy if exists "client onboarding token upload" on storage.objects;
create policy "client onboarding token upload" on storage.objects
for insert to anon,authenticated
with check(bucket_id='labnarrative-images' and public.client_onboarding_storage_path_valid(name));

drop policy if exists "client onboarding token delete" on storage.objects;
create policy "client onboarding token delete" on storage.objects
for delete to anon,authenticated
using(bucket_id='labnarrative-images' and public.client_onboarding_storage_path_valid(name));
