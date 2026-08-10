create or replace function public.site_editor_archive(p_slug text, p_confirm_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'labnarrative_engine_v3'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_site public.sites%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_run_id uuid;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_site from public.sites where slug=p_slug for update;
  if not found then raise exception 'site_not_found'; end if;
  if coalesce(trim(p_confirm_slug),'') <> v_site.slug then return jsonb_build_object('ok',false,'confirmationMismatch',true,'slug',v_site.slug); end if;
  if v_site.status='archived' then return jsonb_build_object('ok',false,'alreadyArchived',true,'slug',v_site.slug,'siteStatus','archived'); end if;

  insert into public.site_revisions(site_id,status,content,base_site_updated_at,note,validation,source,created_by,created_at,updated_at,published_at,published_by,publish_status_target)
  values(v_site.id,'snapshot',v_site.content,v_site.updated_at,'Automatic snapshot before archiving website from Site Editor',public.site_editor_validate_content(v_site.id,v_site.content),'pre_archive_snapshot',v_uid,v_now,v_now,v_now,v_uid,case when v_site.status='live' then 'live' else 'concept' end);

  update public.sites set status='archived',updated_at=v_now where id=v_site.id;
  update public.site_revisions set base_site_updated_at=v_now,updated_at=v_now where site_id=v_site.id and status='draft';

  select id into v_run_id from labnarrative_engine_v3.runs where site_id=v_site.id and state<>'cancelled' order by updated_at desc limit 1;
  if v_run_id is not null then
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(v_run_id,'site_archived','Website archived from the Visual Site Editor.',jsonb_build_object('siteId',v_site.id,'slug',v_site.slug,'previousStatus',v_site.status));
  end if;

  return jsonb_build_object('ok',true,'siteId',v_site.id,'slug',v_site.slug,'siteStatus','archived','archivedAt',v_now);
end;
$function$;

revoke all on function public.site_editor_archive(text,text) from public;
grant execute on function public.site_editor_archive(text,text) to authenticated;
