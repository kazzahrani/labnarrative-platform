create table if not exists public.site_revisions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','published','snapshot','discarded')),
  content jsonb not null,
  base_site_updated_at timestamptz not null,
  note text not null default '',
  validation jsonb not null default '{"ok":true,"issues":[]}'::jsonb,
  source text not null default 'manual_editor',
  restore_of uuid null references public.site_revisions(id) on delete set null,
  created_by uuid null,
  published_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null
);

create unique index if not exists site_revisions_one_draft_per_site
  on public.site_revisions(site_id) where status='draft';
create index if not exists site_revisions_site_history_idx
  on public.site_revisions(site_id, created_at desc);

alter table public.site_revisions enable row level security;
revoke all on public.site_revisions from anon, authenticated;

create or replace function public.site_editor_validate_content(p_site_id uuid, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare
  v_slug text;
  v_is_v3 boolean := false;
  v_issues text[] := array[]::text[];
  v_key text;
  v_required text[] := array['slug','piName','labName','title','institution','eyebrow','headline','introduction','focusAreas','projects','team','members','publications','research','pages','theme','design'];
  v_arrays text[] := array['focusAreas','projects','team','members','publications','research'];
  v_theme text[] := array['background','surface','foreground','muted','accent'];
begin
  select s.slug into v_slug from public.sites s where s.id=p_site_id;
  if v_slug is null then
    return jsonb_build_object('ok',false,'issues',jsonb_build_array('Site not found'));
  end if;

  select exists(select 1 from labnarrative_engine_v3.runs r where r.site_id=p_site_id and r.state<>'cancelled') into v_is_v3;

  if p_content is null or jsonb_typeof(p_content)<>'object' then
    return jsonb_build_object('ok',false,'issues',jsonb_build_array('Website content must be a JSON object'));
  end if;

  foreach v_key in array v_required loop
    if not (p_content ? v_key) or p_content->v_key is null or p_content->v_key='null'::jsonb then
      v_issues := array_append(v_issues, 'Missing '||v_key);
    end if;
  end loop;

  foreach v_key in array v_arrays loop
    if jsonb_typeof(p_content->v_key) is distinct from 'array' then
      v_issues := array_append(v_issues, v_key||' must be an array');
    end if;
  end loop;

  if jsonb_typeof(p_content->'pages') is distinct from 'object' then v_issues:=array_append(v_issues,'pages must be an object'); end if;
  if jsonb_typeof(p_content->'theme') is distinct from 'object' then v_issues:=array_append(v_issues,'theme must be an object'); end if;
  if jsonb_typeof(p_content->'design') is distinct from 'object' then v_issues:=array_append(v_issues,'design must be an object'); end if;

  if coalesce(trim(p_content->>'slug'),'')<>v_slug then
    v_issues:=array_append(v_issues,'Slug must remain '||v_slug);
  end if;

  foreach v_key in array v_theme loop
    if coalesce(trim(p_content->'theme'->>v_key),'')='' then
      v_issues:=array_append(v_issues,'Theme '||v_key||' is required');
    end if;
  end loop;

  if coalesce(trim(p_content->'design'->>'key'),'')='' then v_issues:=array_append(v_issues,'Design key is required'); end if;
  if coalesce(trim(p_content->>'piName'),'')='' then v_issues:=array_append(v_issues,'Principal investigator name is required'); end if;
  if coalesce(trim(p_content->>'labName'),'')='' then v_issues:=array_append(v_issues,'Laboratory name is required'); end if;
  if coalesce(trim(p_content->>'headline'),'')='' then v_issues:=array_append(v_issues,'Headline is required'); end if;
  if coalesce(trim(p_content->>'introduction'),'')='' then v_issues:=array_append(v_issues,'Introduction is required'); end if;

  if jsonb_typeof(p_content->'research')='array' and jsonb_array_length(p_content->'research')=0 then v_issues:=array_append(v_issues,'At least one research programme is required'); end if;
  if jsonb_typeof(p_content->'publications')='array' and jsonb_array_length(p_content->'publications')=0 then v_issues:=array_append(v_issues,'At least one publication is required'); end if;

  if v_is_v3 and coalesce(trim(p_content->'pages'->'home'->>'piImage'), trim(p_content->'pages'->'contact'->>'piImage'), '')='' then
    v_issues:=array_append(v_issues,'Engine v3 requires a PI portrait');
  end if;

  return jsonb_build_object('ok',cardinality(v_issues)=0,'issues',to_jsonb(v_issues),'engineV3',v_is_v3);
end;
$$;

create or replace function public.site_editor_open(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare v_uid uuid:=auth.uid(); v_site public.sites%rowtype; v_revision public.site_revisions%rowtype; v_history jsonb;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_site from public.sites where slug=p_slug;
  if not found then raise exception 'site_not_found'; end if;
  select * into v_revision from public.site_revisions where site_id=v_site.id and status='draft' order by updated_at desc limit 1;
  if not found then
    insert into public.site_revisions(site_id,status,content,base_site_updated_at,created_by,validation)
    values(v_site.id,'draft',v_site.content,v_site.updated_at,v_uid,public.site_editor_validate_content(v_site.id,v_site.content)) returning * into v_revision;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'note',r.note,'source',r.source,'createdAt',r.created_at,'updatedAt',r.updated_at,'publishedAt',r.published_at,'restoreOf',r.restore_of,'validation',r.validation) order by coalesce(r.published_at,r.created_at) desc),'[]'::jsonb)
  into v_history from (select * from public.site_revisions where site_id=v_site.id and status in ('published','snapshot') order by coalesce(published_at,created_at) desc limit 30) r;
  return jsonb_build_object(
    'site',jsonb_build_object('id',v_site.id,'slug',v_site.slug,'status',v_site.status,'content',v_site.content,'updatedAt',v_site.updated_at,'domainStatus',v_site.domain_status,'domainUrl',v_site.domain_url,'outreachStatus',v_site.outreach_status),
    'revision',jsonb_build_object('id',v_revision.id,'content',v_revision.content,'note',v_revision.note,'baseSiteUpdatedAt',v_revision.base_site_updated_at,'updatedAt',v_revision.updated_at,'validation',v_revision.validation),
    'history',v_history,
    'validation',public.site_editor_validate_content(v_site.id,v_revision.content),
    'engineV3',exists(select 1 from labnarrative_engine_v3.runs where site_id=v_site.id and state<>'cancelled')
  );
end;
$$;

create or replace function public.site_editor_save(p_revision_id uuid, p_content jsonb, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare v_uid uuid:=auth.uid(); v_site_id uuid; v_validation jsonb; v_updated timestamptz:=clock_timestamp();
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select site_id into v_site_id from public.site_revisions where id=p_revision_id and status='draft' for update;
  if v_site_id is null then raise exception 'draft_revision_not_found'; end if;
  v_validation:=public.site_editor_validate_content(v_site_id,p_content);
  update public.site_revisions set content=p_content,note=coalesce(p_note,''),validation=v_validation,updated_at=v_updated where id=p_revision_id;
  return jsonb_build_object('ok',true,'revisionId',p_revision_id,'updatedAt',v_updated,'validation',v_validation);
end;
$$;

create or replace function public.site_editor_reset_to_live(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare v_uid uuid:=auth.uid(); v_site public.sites%rowtype; v_updated timestamptz:=clock_timestamp();
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select s.* into v_site from public.sites s join public.site_revisions r on r.site_id=s.id where r.id=p_revision_id and r.status='draft' for update of r;
  if not found then raise exception 'draft_revision_not_found'; end if;
  update public.site_revisions set content=v_site.content,base_site_updated_at=v_site.updated_at,note='',restore_of=null,validation=public.site_editor_validate_content(v_site.id,v_site.content),updated_at=v_updated where id=p_revision_id;
  return jsonb_build_object('ok',true,'content',v_site.content,'baseSiteUpdatedAt',v_site.updated_at,'updatedAt',v_updated,'validation',public.site_editor_validate_content(v_site.id,v_site.content));
end;
$$;

create or replace function public.site_editor_use_history(p_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, labnarrative_engine_v3
as $$
declare v_uid uuid:=auth.uid(); v_hist public.site_revisions%rowtype; v_site public.sites%rowtype; v_draft public.site_revisions%rowtype; v_updated timestamptz:=clock_timestamp();
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select * into v_hist from public.site_revisions where id=p_history_id and status in ('published','snapshot');
  if not found then raise exception 'history_revision_not_found'; end if;
  select * into v_site from public.sites where id=v_hist.site_id;
  select * into v_draft from public.site_revisions where site_id=v_hist.site_id and status='draft' for update;
  if not found then
    insert into public.site_revisions(site_id,status,content,base_site_updated_at,note,validation,source,restore_of,created_by,updated_at)
    values(v_site.id,'draft',v_hist.content,v_site.updated_at,'Restore candidate from revision '||v_hist.id,public.site_editor_validate_content(v_site.id,v_hist.content),'history_restore',v_hist.id,v_uid,v_updated) returning * into v_draft;
  else
    update public.site_revisions set content=v_hist.content,base_site_updated_at=v_site.updated_at,note='Restore candidate from revision '||v_hist.id,validation=public.site_editor_validate_content(v_site.id,v_hist.content),source='history_restore',restore_of=v_hist.id,updated_at=v_updated where id=v_draft.id returning * into v_draft;
  end if;
  return jsonb_build_object('ok',true,'revisionId',v_draft.id,'content',v_draft.content,'baseSiteUpdatedAt',v_draft.base_site_updated_at,'updatedAt',v_draft.updated_at,'validation',v_draft.validation);
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
  v_schema integer; v_design_key text; v_design_version integer; v_design_settings jsonb;
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
  insert into public.site_revisions(site_id,status,content,base_site_updated_at,note,validation,source,created_by,created_at,updated_at,published_at,published_by)
  values(v_site.id,'snapshot',v_site.content,v_site.updated_at,'Automatic snapshot before publishing revision '||v_rev.id,public.site_editor_validate_content(v_site.id,v_site.content),'pre_publish_snapshot',v_uid,v_now,v_now,v_now,v_uid);
  begin v_schema:=coalesce(nullif(v_rev.content->>'schemaVersion','')::integer,v_site.content_schema_version); exception when others then v_schema:=v_site.content_schema_version; end;
  v_design_key:=coalesce(nullif(v_rev.content->'design'->>'key',''),v_site.design_key);
  begin v_design_version:=coalesce(nullif(v_rev.content->'design'->>'version','')::integer,v_site.design_version); exception when others then v_design_version:=v_site.design_version; end;
  v_design_settings:=coalesce(v_rev.content->'design'->'settings',v_site.design_settings,'{}'::jsonb);
  update public.sites set content=v_rev.content,content_schema_version=v_schema,design_key=v_design_key,design_version=v_design_version,design_settings=v_design_settings,updated_at=v_now where id=v_site.id;
  update public.site_revisions set status='published',validation=v_validation,published_at=v_now,published_by=v_uid,updated_at=v_now where id=v_rev.id;
  select id into v_run_id from labnarrative_engine_v3.runs where site_id=v_site.id and state<>'cancelled' order by updated_at desc limit 1;
  if v_run_id is not null then
    insert into labnarrative_engine_v3.events(run_id,event_type,message,payload) values(v_run_id,'site_revision_published','Human-approved site revision published from Site Editor.',jsonb_build_object('revisionId',v_rev.id,'siteId',v_site.id,'slug',v_site.slug));
  end if;
  return jsonb_build_object('ok',true,'revisionId',v_rev.id,'siteId',v_site.id,'slug',v_site.slug,'publishedAt',v_now,'validation',v_validation);
end;
$$;

grant execute on function public.site_editor_validate_content(uuid,jsonb) to authenticated;
grant execute on function public.site_editor_open(text) to authenticated;
grant execute on function public.site_editor_save(uuid,jsonb,text) to authenticated;
grant execute on function public.site_editor_reset_to_live(uuid) to authenticated;
grant execute on function public.site_editor_use_history(uuid) to authenticated;
grant execute on function public.site_editor_publish(uuid) to authenticated;
