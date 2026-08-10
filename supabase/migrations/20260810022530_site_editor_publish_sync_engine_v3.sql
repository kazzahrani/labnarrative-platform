create or replace function public.site_editor_publish(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','labnarrative_engine_v3'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_rev public.site_revisions%rowtype;
  v_site public.sites%rowtype;
  v_validation jsonb;
  v_now timestamptz:=clock_timestamp();
  v_run labnarrative_engine_v3.runs%rowtype;
  v_schema integer;
  v_design_key text;
  v_design_version integer;
  v_design_settings jsonb;
  v_publish_status text;
  v_public_url text;
  v_engine_publish jsonb:=null;
  v_outreach jsonb:=null;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then
    raise exception 'admin_access_required';
  end if;

  select * into v_rev
  from public.site_revisions
  where id=p_revision_id and status='draft'
  for update;
  if not found then raise exception 'draft_revision_not_found'; end if;

  select * into v_site from public.sites where id=v_rev.site_id for update;
  if not found then raise exception 'site_not_found'; end if;
  if v_site.status='archived' then raise exception 'archived_site_cannot_publish'; end if;

  if v_site.updated_at is distinct from v_rev.base_site_updated_at then
    return jsonb_build_object(
      'ok',false,
      'stale',true,
      'issues',jsonb_build_array('The live site changed after this draft was created. Reset the draft to the current live version before publishing.')
    );
  end if;

  v_validation:=public.site_editor_validate_content(v_site.id,v_rev.content);
  if not coalesce((v_validation->>'ok')::boolean,false) then
    update public.site_revisions set validation=v_validation,updated_at=v_now where id=v_rev.id;
    return jsonb_build_object('ok',false,'validation',v_validation,'issues',v_validation->'issues');
  end if;

  insert into public.site_revisions(
    site_id,status,content,base_site_updated_at,note,validation,source,
    created_by,created_at,updated_at,published_at,published_by,publish_status_target
  ) values(
    v_site.id,'snapshot',v_site.content,v_site.updated_at,
    'Automatic snapshot before publishing revision '||v_rev.id,
    public.site_editor_validate_content(v_site.id,v_site.content),
    'pre_publish_snapshot',v_uid,v_now,v_now,v_now,v_uid,v_rev.publish_status_target
  );

  begin
    v_schema:=coalesce(nullif(v_rev.content->>'schemaVersion','')::integer,v_site.content_schema_version);
  exception when others then
    v_schema:=v_site.content_schema_version;
  end;
  v_design_key:=coalesce(nullif(v_rev.content->'design'->>'key',''),v_site.design_key);
  begin
    v_design_version:=coalesce(nullif(v_rev.content->'design'->>'version','')::integer,v_site.design_version);
  exception when others then
    v_design_version:=v_site.design_version;
  end;
  v_design_settings:=coalesce(v_rev.content->'design'->'settings',v_site.design_settings,'{}'::jsonb);
  v_publish_status:=coalesce(v_rev.publish_status_target,case when v_site.status='live' then 'live' else 'concept' end);
  if v_publish_status not in ('concept','live') then v_publish_status:='concept'; end if;
  v_public_url:=coalesce(nullif(v_site.domain_url,''),'https://' || v_site.slug || '.labnarrative.com');

  update public.sites
  set content=v_rev.content,
      content_schema_version=v_schema,
      design_key=v_design_key,
      design_version=v_design_version,
      design_settings=v_design_settings,
      status=v_publish_status,
      domain_status='live',
      domain_url=v_public_url,
      domain_error=null,
      domain_connected_at=coalesce(domain_connected_at,v_now),
      domain_checked_at=v_now,
      updated_at=v_now
  where id=v_site.id;

  update public.site_revisions
  set status='published',validation=v_validation,published_at=v_now,published_by=v_uid,updated_at=v_now
  where id=v_rev.id;

  select * into v_run
  from labnarrative_engine_v3.runs
  where site_id=v_site.id and state<>'cancelled'
  order by updated_at desc
  limit 1;

  if v_run.id is not null and v_run.state='final_review' then
    v_engine_publish:=public.engine_v3_admin_approve_publish(
      v_run.id,
      coalesce(nullif(v_rev.note,''),'Published from Visual Site Editor')
    );
  elsif v_run.id is not null then
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
    values(
      v_run.id,
      'site_revision_published',
      'Human-approved site revision published from Site Editor.',
      jsonb_build_object(
        'revisionId',v_rev.id,
        'siteId',v_site.id,
        'slug',v_site.slug,
        'siteStatus',v_publish_status,
        'publicUrl',v_public_url
      )
    );

    if v_run.state='published' then
      v_outreach:=public.engine_v3_ensure_outreach_draft(v_run.id);
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'revisionId',v_rev.id,
    'siteId',v_site.id,
    'slug',v_site.slug,
    'siteStatus',case when v_engine_publish is not null then coalesce(v_engine_publish->>'siteStatus',v_publish_status) else v_publish_status end,
    'publicUrl',case when v_engine_publish is not null then coalesce(v_engine_publish->>'publicUrl',v_public_url) else v_public_url end,
    'publishedAt',v_now,
    'validation',v_validation,
    'engineV3RunId',v_run.id,
    'engineV3State',case when v_engine_publish is not null then v_engine_publish->>'state' else v_run.state end,
    'platformSynchronized',case when v_run.id is null then false else true end,
    'outreachSent',false,
    'outreachDraft',coalesce(v_engine_publish->'outreachDraft',v_outreach)
  );
end;
$function$;

revoke all on function public.site_editor_publish(uuid) from public;
grant execute on function public.site_editor_publish(uuid) to authenticated;
