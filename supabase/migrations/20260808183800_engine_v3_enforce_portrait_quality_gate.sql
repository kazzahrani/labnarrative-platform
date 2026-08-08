create or replace function labnarrative_engine_v3.finalize_for_review(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'labnarrative_engine_v3'
as $function$
declare
  v_run labnarrative_engine_v3.runs%rowtype;
  v_site public.sites%rowtype;
  v_portrait text;
  v_portrait_meta jsonb;
  v_variant text;
  v_projects integer;
  v_research integer;
  v_publications integer;
  v_applied boolean;
begin
  select * into v_run from labnarrative_engine_v3.runs where id=p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.state<>'producing' then raise exception 'run_not_producing:%',v_run.state; end if;
  if v_run.site_id is null then raise exception 'draft_site_missing'; end if;
  select * into v_site from public.sites where id=v_run.site_id for update;
  if not found then raise exception 'draft_site_missing'; end if;
  if v_site.status<>'draft' then raise exception 'draft_site_not_private:%',v_site.status; end if;
  if v_site.slug<>v_run.slug then raise exception 'site_slug_mismatch'; end if;

  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='identity' and status='verified') then raise exception 'identity_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='official_profile' and status='verified') then raise exception 'official_profile_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='research' and status='verified') then raise exception 'research_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='publications' and status='verified') then raise exception 'publication_evidence_missing'; end if;
  if not exists(select 1 from labnarrative_engine_v3.evidence where run_id=p_run_id and evidence_type='contact' and status in ('verified','unavailable')) then raise exception 'contact_evidence_missing'; end if;

  select asset_url, coalesce(metadata,'{}'::jsonb)
    into v_portrait, v_portrait_meta
  from labnarrative_engine_v3.assets
  where run_id=p_run_id and asset_role='portrait' and status='verified' and coalesce(asset_url,'')<>'';
  if coalesce(v_portrait,'')='' then raise exception 'portrait_missing'; end if;

  if coalesce(v_portrait_meta->>'portrait_gate','')<>'passed' then raise exception 'portrait_unverified'; end if;
  if coalesce((v_portrait_meta->>'identity_verified')::boolean,false) is not true then raise exception 'portrait_unverified'; end if;
  if coalesce((v_portrait_meta->>'source_verified')::boolean,false) is not true then raise exception 'portrait_unverified'; end if;
  if coalesce((v_portrait_meta->>'quality_verified')::boolean,false) is not true then raise exception 'portrait_low_quality'; end if;
  if coalesce((v_portrait_meta->>'render_verified')::boolean,false) is not true then raise exception 'portrait_not_rendering'; end if;

  v_projects := case when jsonb_typeof(v_site.content->'projects')='array' then jsonb_array_length(v_site.content->'projects') else 0 end;
  v_research := case when jsonb_typeof(v_site.content->'research')='array' then jsonb_array_length(v_site.content->'research') else 0 end;
  v_publications := case when jsonb_typeof(v_site.content->'publications')='array' then jsonb_array_length(v_site.content->'publications') else 0 end;
  if v_projects<4 then raise exception 'four_projects_required:%',v_projects; end if;
  if v_research<4 then raise exception 'four_research_pages_required:%',v_research; end if;
  if v_publications<4 then raise exception 'four_verified_publications_required:%',v_publications; end if;
  if coalesce(v_site.content->>'piName','')='' or coalesce(v_site.content->>'labName','')='' or coalesce(v_site.content->>'headline','')='' or coalesce(v_site.content->>'introduction','')='' then raise exception 'required_site_copy_missing'; end if;

  v_variant := coalesce(v_site.design_settings->>'variant',v_site.content->'design'->'settings'->>'variant','');
  if v_variant<>'ciribilli-narita-v1' then raise exception 'narita_design_required:%',v_variant; end if;

  v_applied := coalesce(v_site.content->'members'->0->>'image','')=v_portrait
    or coalesce(v_site.content->'pages'->'home'->>'piImage','')=v_portrait
    or coalesce(v_site.content->'pages'->'home'->>'topPortrait','')=v_portrait
    or coalesce(v_site.content->'pages'->'contact'->>'piImage','')=v_portrait;
  if not v_applied then raise exception 'verified_portrait_not_applied_to_site'; end if;

  update labnarrative_engine_v3.runs
  set state='final_review',updated_at=now(),summary=summary || jsonb_build_object('finalizedAt',now(),'portrait',v_portrait,'portraitGate','passed','projects',v_projects,'research',v_research,'publications',v_publications)
  where id=p_run_id;
  update public.prospects set status='awaiting_final_review',updated_at=now() where id=v_run.prospect_id;
  insert into labnarrative_engine_v3.review(run_id,decision,updated_at) values(p_run_id,'pending',now())
  on conflict(run_id) do update set decision='pending',note=null,actor_user_id=null,decided_at=null,updated_at=now();
  insert into labnarrative_engine_v3.events(run_id,event_type,message,payload)
  values(p_run_id,'final_review','Engine v3 production passed deterministic review gates, including portrait quality/render verification.',jsonb_build_object('siteId',v_run.site_id,'portrait',v_portrait,'portraitGate','passed'));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','final_review','siteId',v_run.site_id,'previewPath','/admin/preview/'||v_run.slug);
end;
$function$;
