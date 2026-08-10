alter table public.site_revisions
  add column if not exists publish_status_target text null;

alter table public.site_revisions
  drop constraint if exists site_revisions_publish_status_target_check;

alter table public.site_revisions
  add constraint site_revisions_publish_status_target_check
  check (publish_status_target is null or publish_status_target in ('concept','live'));

update public.site_revisions r
set publish_status_target = case when s.status = 'live' then 'live' else 'concept' end
from public.sites s
where r.site_id = s.id
  and r.status = 'draft'
  and r.publish_status_target is null;

create or replace function public.site_editor_open(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare
  v_uid uuid:=auth.uid();
  v_site public.sites%rowtype;
  v_revision public.site_revisions%rowtype;
  v_history jsonb;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_site from public.sites where slug=p_slug;
  if not found then raise exception 'site_not_found'; end if;

  select * into v_revision from public.site_revisions where site_id=v_site.id and status='draft' order by updated_at desc limit 1;
  if not found then
    insert into public.site_revisions(site_id,status,content,base_site_updated_at,created_by,validation,publish_status_target)
    values(
      v_site.id,
      'draft',
      v_site.content,
      v_site.updated_at,
      v_uid,
      public.site_editor_validate_content(v_site.id,v_site.content),
      case when v_site.status='live' then 'live' else 'concept' end
    )
    returning * into v_revision;
  elsif v_revision.publish_status_target is null then
    update public.site_revisions
    set publish_status_target=case when v_site.status='live' then 'live' else 'concept' end
    where id=v_revision.id
    returning * into v_revision;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'status',r.status,'note',r.note,'source',r.source,'createdAt',r.created_at,'updatedAt',r.updated_at,'publishedAt',r.published_at,
    'restoreOf',r.restore_of,'validation',r.validation
  ) order by coalesce(r.published_at,r.created_at) desc),'[]'::jsonb)
  into v_history
  from (select * from public.site_revisions where site_id=v_site.id and status in ('published','snapshot') order by coalesce(published_at,created_at) desc limit 30) r;

  return jsonb_build_object(
    'site',jsonb_build_object('id',v_site.id,'slug',v_site.slug,'status',v_site.status,'content',v_site.content,'updatedAt',v_site.updated_at,'domainStatus',v_site.domain_status,'domainUrl',v_site.domain_url,'outreachStatus',v_site.outreach_status),
    'revision',jsonb_build_object('id',v_revision.id,'content',v_revision.content,'note',v_revision.note,'baseSiteUpdatedAt',v_revision.base_site_updated_at,'updatedAt',v_revision.updated_at,'validation',v_revision.validation,'publishStatusTarget',v_revision.publish_status_target),
    'history',v_history,
    'validation',public.site_editor_validate_content(v_site.id,v_revision.content),
    'engineV3',exists(select 1 from labnarrative_engine_v3.runs where site_id=v_site.id and state<>'cancelled')
  );
end;
$$;

create or replace function public.site_editor_publish(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare
  v_uid uuid:=auth.uid(); v_rev public.site_revisions%rowtype; v_site public.sites%rowtype; v_validation jsonb; v_now timestamptz:=clock_timestamp(); v_run_id uuid;
  v_schema integer; v_design_key text; v_design_version integer; v_design_settings jsonb; v_publish_status text;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_rev from public.site_revisions where id=p_revision_id and status='draft' for update;
  if not found then raise exception 'draft_revision_not_found'; end if;
  select * into v_site from public.sites where id=v_rev.site_id for update;
  if v_site.updated_at is distinct from v_rev.base_site_updated_at then
    return jsonb_build_object('ok',false,'stale',true,'issues',jsonb_build_array('The live site changed after this draft was created. Reset the draft to the current live version before publishing.'));
  end if;
  v_validation:=public.site_editor_validate_content(v_site.id,v_rev.content);
  if not coalesce((v_validation->>'ok')::boolean,false) then
    update public.site_revisions set validation=v_validation,updated_at=v_now where id=v_rev.id;
    return jsonb_build_object('ok',false,'validation',v_validation,'issues',v_validation->'issues');
  end if;

  insert into public.site_revisions(site_id,status,content,base_site_updated_at,note,validation,source,created_by,created_at,updated_at,published_at,published_by,publish_status_target)
  values(v_site.id,'snapshot',v_site.content,v_site.updated_at,'Automatic snapshot before publishing revision '||v_rev.id,public.site_editor_validate_content(v_site.id,v_site.content),'pre_publish_snapshot',v_uid,v_now,v_now,v_now,v_uid,v_rev.publish_status_target);

  begin v_schema:=coalesce(nullif(v_rev.content->>'schemaVersion','')::integer,v_site.content_schema_version); exception when others then v_schema:=v_site.content_schema_version; end;
  v_design_key:=coalesce(nullif(v_rev.content->'design'->>'key',''),v_site.design_key);
  begin v_design_version:=coalesce(nullif(v_rev.content->'design'->>'version','')::integer,v_site.design_version); exception when others then v_design_version:=v_site.design_version; end;
  v_design_settings:=coalesce(v_rev.content->'design'->'settings',v_site.design_settings,'{}'::jsonb);
  v_publish_status:=coalesce(v_rev.publish_status_target,case when v_site.status='live' then 'live' else 'concept' end);

  update public.sites
  set content=v_rev.content,
      content_schema_version=v_schema,
      design_key=v_design_key,
      design_version=v_design_version,
      design_settings=v_design_settings,
      status=v_publish_status,
      updated_at=v_now
  where id=v_site.id;

  update public.site_revisions set status='published',validation=v_validation,published_at=v_now,published_by=v_uid,updated_at=v_now where id=v_rev.id;

  select id into v_run_id from labnarrative_engine_v3.runs where site_id=v_site.id and state<>'cancelled' order by updated_at desc limit 1;
  if v_run_id is not null then
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(v_run_id,'site_revision_published','Human-approved site revision published from Site Editor.',jsonb_build_object('revisionId',v_rev.id,'siteId',v_site.id,'slug',v_site.slug,'siteStatus',v_publish_status));
  end if;

  return jsonb_build_object('ok',true,'revisionId',v_rev.id,'siteId',v_site.id,'slug',v_site.slug,'siteStatus',v_publish_status,'publishedAt',v_now,'validation',v_validation);
end;
$$;

create or replace function public.site_editor_unpublish(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare
  v_uid uuid:=auth.uid();
  v_rev public.site_revisions%rowtype;
  v_site public.sites%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_previous_status text;
  v_run_id uuid;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;

  select * into v_rev from public.site_revisions where id=p_revision_id and status='draft' for update;
  if not found then raise exception 'draft_revision_not_found'; end if;

  select * into v_site from public.sites where id=v_rev.site_id for update;
  if v_site.status not in ('concept','live') then
    return jsonb_build_object('ok',false,'alreadyPrivate',true,'siteStatus',v_site.status);
  end if;

  v_previous_status:=v_site.status;

  insert into public.site_revisions(site_id,status,content,base_site_updated_at,note,validation,source,created_by,created_at,updated_at,published_at,published_by,publish_status_target)
  values(v_site.id,'snapshot',v_site.content,v_site.updated_at,'Automatic snapshot before unpublishing site',public.site_editor_validate_content(v_site.id,v_site.content),'pre_unpublish_snapshot',v_uid,v_now,v_now,v_now,v_uid,v_previous_status);

  update public.sites
  set status='draft', updated_at=v_now
  where id=v_site.id;

  update public.site_revisions
  set base_site_updated_at=v_now,
      publish_status_target=v_previous_status,
      updated_at=v_now
  where id=v_rev.id;

  select id into v_run_id from labnarrative_engine_v3.runs where site_id=v_site.id and state<>'cancelled' order by updated_at desc limit 1;
  if v_run_id is not null then
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(v_run_id,'site_unpublished','Site unpublished from the Visual Site Editor.',jsonb_build_object('siteId',v_site.id,'slug',v_site.slug,'previousStatus',v_previous_status));
  end if;

  return jsonb_build_object('ok',true,'siteId',v_site.id,'slug',v_site.slug,'previousStatus',v_previous_status,'siteStatus','draft','unpublishedAt',v_now);
end;
$$;

revoke execute on function public.site_editor_unpublish(uuid) from public, anon;
grant execute on function public.site_editor_unpublish(uuid) to authenticated;
