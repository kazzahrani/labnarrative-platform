create or replace function public.engine_v3_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'labnarrative_engine_v3'
as $function$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then raise exception 'admin_access_required'; end if;
  select jsonb_build_object(
    'runtime',(select to_jsonb(r) from labnarrative_engine_v3.runtime r where singleton=true),
    'counts',jsonb_build_object(
      'eligibleQueue',(select count(*) from public.prospects p where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>'' and not exists(select 1 from public.sites s where s.slug=p.slug)),
      'producing',(select count(*) from labnarrative_engine_v3.runs r where r.state='producing' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'finalReview',(select count(*) from labnarrative_engine_v3.runs r where r.state='final_review' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'published',(select count(*) from labnarrative_engine_v3.runs r where r.state='published' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'blocked',(select count(*) from labnarrative_engine_v3.runs r where r.state='blocked' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),
      'completed',(select count(*) from labnarrative_engine_v3.runs r where r.state='completed' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived')))
    ),
    'queue',coalesce((select jsonb_agg(jsonb_build_object('prospectId',p.id,'piName',p.pi_name,'slug',p.slug,'institution',p.institution,'score',p.qualification_score,'queuedAt',p.queued_at) order by p.queued_at asc nulls last,p.created_at asc) from public.prospects p where p.status='queued' and p.site_id is null and coalesce(trim(p.slug),'')<>'' and not exists(select 1 from public.sites s where s.slug=p.slug)),'[]'::jsonb),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'prospectId',r.prospect_id,'siteId',r.site_id,'piName',r.pi_name,'slug',r.slug,'state',r.state,'blockedReason',r.blocked_reason,'startedAt',r.started_at,'updatedAt',r.updated_at,'previewPath',case when r.site_id is not null then '/admin/preview/'||r.slug else null end,'publicUrl',case when r.state in ('published','completed') then 'https://' || r.slug || '.labnarrative.com' else null end,'evidenceCount',(select count(*) from labnarrative_engine_v3.evidence e where e.run_id=r.id and e.status='verified'),'assetCount',(select count(*) from labnarrative_engine_v3.assets a where a.run_id=r.id and a.status='verified')) order by r.updated_at desc) from labnarrative_engine_v3.runs r where r.state<>'cancelled' and (r.site_id is null or exists(select 1 from public.sites s where s.id=r.site_id and s.status<>'archived'))),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
