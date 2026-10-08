create or replace function public.pvos_authority_catalogue(p_org uuid) returns void language plpgsql security definer set search_path='' as $fn$
begin
 insert into public.pvos_authority_sources(organization_id,source_key,name,url,method,feed_url,coverage_note) values
 (p_org,'sfda','SFDA safety alerts','https://www.sfda.gov.sa/en/safety_alert','manual',null,'Manual check required. No automatic SFDA website coverage is claimed.'),
 (p_org,'mhra_dsu','MHRA Drug Safety Update','https://www.gov.uk/drug-safety-update','atom','https://www.gov.uk/drug-safety-update.atom','Automatic collection covers the published Drug Safety Update feed only. Recent feed window; confirm archives and additional SOP-required channels manually.'),
 (p_org,'fda_medwatch','FDA MedWatch safety alerts','https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program','rss','https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml','Automatic collection covers the MedWatch feed only, including non-drug notices. It does not cover all FDA safety channels or historical archives.'),
 (p_org,'ema','EMA safety communications','https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/direct-healthcare-professional-communications','manual',null,'Manual check required. No automatic EMA website coverage is claimed.')
 on conflict(organization_id,source_key) do nothing;
end $fn$;
create or replace function public.pvos_configure_authority_monitoring(p_company_id uuid,p_owner_id uuid,p_reviewer_id uuid,p_source_ids uuid[],p_sop text,p_form text,p_scope text,p_start_month date,p_enabled boolean default true) returns void language plpgsql security definer set search_path='' as $fn$
declare c public.pvos_companies%rowtype;v_role text;v_email text;
begin
 select * into c from public.pvos_companies where id=p_company_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(c.organization_id) then raise exception 'Company not accessible';end if;
 select role into v_role from public.pvos_memberships where organization_id=c.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'A QPPV administrator must confirm monitoring scope';end if;
 if p_owner_id is null or p_reviewer_id is null or p_owner_id=p_reviewer_id or not exists(select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_owner_id) or not exists(select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_reviewer_id and role in ('admin','qppv','deputy_qppv')) then raise exception 'Choose a workspace owner and a different QPPV reviewer';end if;
 if p_enabled and not exists(select 1 from public.pvos_products where company_id=c.id) then raise exception 'Add company products before enabling monitoring';end if;
 perform public.pvos_authority_catalogue(c.organization_id);
 if coalesce(cardinality(p_source_ids),0)=0 or exists(select 1 from unnest(p_source_ids) chosen(source_id) where not exists(select 1 from public.pvos_authority_sources where pvos_authority_sources.id=chosen.source_id and organization_id=c.organization_id and active)) then raise exception 'Choose accessible active authority sources';end if;
 if not exists(select 1 from public.pvos_authority_sources where id=any(p_source_ids) and organization_id=c.organization_id and source_key='sfda') then raise exception 'Include SFDA in the company monitoring scope';end if;
 if nullif(trim(p_sop),'') is null or nullif(trim(p_form),'') is null or nullif(trim(p_scope),'') is null or greatest(length(p_sop),length(p_form),length(p_scope))>10000 then raise exception 'Record the SOP/version, company form/version and authority applicability rationale';end if;
 if p_start_month is null or p_start_month<>date_trunc('month',p_start_month)::date or p_start_month<date_trunc('month',now() at time zone 'Asia/Riyadh')::date-interval '12 months' or p_start_month>date_trunc('month',now() at time zone 'Asia/Riyadh')::date then raise exception 'Choose a starting month within the last 12 months';end if;
 select email into v_email from auth.users where id=auth.uid();
 insert into public.pvos_authority_settings(organization_id,company_id,owner_user_id,reviewer_user_id,source_ids,sop_reference,form_reference,scope_rationale,start_month,enabled,confirmed_by,confirmed_email)
 values(c.organization_id,c.id,p_owner_id,p_reviewer_id,p_source_ids,trim(p_sop),trim(p_form),trim(p_scope),p_start_month,coalesce(p_enabled,false),auth.uid(),v_email)
 on conflict(company_id) do update set owner_user_id=excluded.owner_user_id,reviewer_user_id=excluded.reviewer_user_id,source_ids=excluded.source_ids,sop_reference=excluded.sop_reference,form_reference=excluded.form_reference,scope_rationale=excluded.scope_rationale,start_month=excluded.start_month,enabled=excluded.enabled,confirmed_by=excluded.confirmed_by,confirmed_email=excluded.confirmed_email,confirmed_at=now(),updated_at=now();
 perform public.pvos_materialize_authority_periods(c.id);
end $fn$;

update public.pvos_authority_sources set url='https://www.sfda.gov.sa/en/safety_alert' where source_key='sfda';
alter table public.pvos_inspection_checklist_links drop constraint pvos_inspection_checklist_links_kind_check;
alter table public.pvos_inspection_checklist_links add constraint pvos_inspection_checklist_links_kind_check check(kind in ('task','document','literature','handover','authority','external'));
create or replace function public.pvos_inspection_sources(p_item_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; l public.pvos_inspection_checklist_links%rowtype;
 s jsonb; result jsonb:='[]'; supporting boolean;
begin
 select * into i from public.pvos_inspection_checklist_items where id=p_item_id;
 for l in select * from public.pvos_inspection_checklist_links where item_id=i.id order by id loop
  s:=null; supporting:=false;
  if l.kind='task' then
   select to_jsonb(t)||jsonb_build_object('active_evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.pvos_task_evidence e where e.task_id=t.id and e.archived_at is null),'[]'::jsonb)) into s
   from public.pvos_tasks t where t.id=l.reference_id and t.organization_id=i.organization_id and t.company_id=i.company_id;
   supporting:=exists(select 1 from public.pvos_task_evidence e where e.task_id=l.reference_id and e.archived_at is null and (nullif(trim(e.file_path),'') is not null or nullif(trim(e.external_url),'') is not null)) and s is not null;
  elsif l.kind='document' then
   select to_jsonb(e) into s from public.pvos_task_evidence e join public.pvos_tasks t on t.id=e.task_id where e.id=l.reference_id and t.organization_id=i.organization_id and t.company_id=i.company_id and e.archived_at is null;
   supporting:=s is not null and (nullif(trim(s->>'file_path'),'') is not null or nullif(trim(s->>'external_url'),'') is not null);
  elsif l.kind='literature' then
   select to_jsonb(r) into s from public.pvos_literature_screening_records r where r.id=l.reference_id and r.organization_id=i.organization_id and r.company_id=i.company_id;
   supporting:=s is not null;
  elsif l.kind='handover' then
   select to_jsonb(e) into s from public.pvos_handover_evidence e where e.id=l.reference_id and e.organization_id=i.organization_id and exists(select 1 from jsonb_array_elements(e.snapshot->'companies') c where c->>'company_id'=i.company_id::text);
   supporting:=s is not null;
  elsif l.kind='authority' then
   select to_jsonb(r) into s from public.pvos_authority_records r where r.id=l.reference_id and r.organization_id=i.organization_id and r.company_id=i.company_id;
   supporting:=s is not null;
  elsif l.kind='external' then
   s:=jsonb_build_object('url',l.external_url,'title',l.title,'version',l.version,'retrieved_by_pvos',false); supporting:=true;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('link',to_jsonb(l),'source',s,'supporting',coalesce(supporting,false)));
 end loop;
 return result;
end $fn$;


-- Atomic source-run + notice-version registration; serialize overlapping collectors.
create function public.pvos_register_authority_collection(p_source_id uuid,p_started_at timestamptz,p_http_status integer,p_feed_sha256 text,p_notices jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare s public.pvos_authority_sources%rowtype;rid uuid;baseline boolean;new_count integer;entries integer;oldest timestamptz;newest timestamptz;
begin
 select * into s from public.pvos_authority_sources where id=p_source_id for update;
 if not found or s.method='manual' then raise exception 'Automatic source not found';end if;
 if jsonb_typeof(p_notices)<>'array' or jsonb_array_length(p_notices)=0 or jsonb_array_length(p_notices)>1000 or p_http_status<>200 or p_feed_sha256!~'^[a-f0-9]{64}$' then raise exception 'Invalid collection result';end if;
 if exists(select 1 from jsonb_array_elements(p_notices) n where nullif(trim(n->>'title'),'') is null or (n->>'url')!~'^https://[^/@:?#[:space:]]+(:[0-9]+)?([/?#][^[:space:]]*)?$' or (n->>'content_sha256')!~'^[a-f0-9]{64}$') then raise exception 'Invalid notice evidence';end if;
 baseline:=not exists(select 1 from public.pvos_authority_notices where source_id=s.id);
 select count(*),min((n->>'published_at')::timestamptz),max((n->>'published_at')::timestamptz) into entries,oldest,newest from jsonb_array_elements(p_notices) n;
 select count(*) into new_count from (select distinct n->>'url' as url,n->>'content_sha256' as hash from jsonb_array_elements(p_notices) n) x where not exists(select 1 from public.pvos_authority_notices where source_id=s.id and url=x.url and content_sha256=x.hash);
 insert into public.pvos_authority_collection_runs(organization_id,source_id,started_at,completed_at,status,http_status,entry_count,new_count,oldest_published_at,newest_published_at,feed_sha256)
 values(s.organization_id,s.id,p_started_at,now(),'ok',p_http_status,entries,new_count,oldest,newest,p_feed_sha256) returning id into rid;
 insert into public.pvos_authority_notices(organization_id,source_id,title,url,published_at,summary,content_sha256,baseline,collection_run_id)
 select s.organization_id,s.id,n->>'title',n->>'url',(n->>'published_at')::timestamptz,n->>'summary',n->>'content_sha256',baseline,rid from jsonb_array_elements(p_notices) n on conflict(source_id,url,content_sha256) do nothing;
 return jsonb_build_object('run_id',rid,'new_count',new_count,'baseline',baseline,'entry_count',entries);
end $fn$;
revoke all on function public.pvos_register_authority_collection(uuid,timestamptz,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.pvos_register_authority_collection(uuid,timestamptz,integer,text,jsonb) to service_role;

create function public.pvos_validate_authority_cron_secret(p_token text) returns boolean language sql stable security definer set search_path='' as $fn$
 select length(p_token)>20 and exists(select 1 from vault.decrypted_secrets where name='pvos_literature_cron_secret' and decrypted_secret=p_token);
$fn$;
revoke all on function public.pvos_validate_authority_cron_secret(text) from public,anon,authenticated;
grant execute on function public.pvos_validate_authority_cron_secret(text) to service_role;
create function public.pvos_invoke_authority_monitor(p_diagnostic boolean default false) returns bigint language plpgsql security definer set search_path='' as $fn$
declare token text;request_id bigint;
begin
 select decrypted_secret into token from vault.decrypted_secrets where name='pvos_literature_cron_secret';
 if token is null then raise exception 'Authority monitoring scheduler secret unavailable';end if;
 select net.http_post(url:='https://kvhmxjfenjtzfavyhnvb.supabase.co/functions/v1/pvos-authority-monitor',headers:=jsonb_build_object('Content-Type','application/json','x-pvos-cron-secret',token),body:=jsonb_build_object('diagnostic',p_diagnostic),timeout_milliseconds:=60000) into request_id;
 return request_id;
end $fn$;
revoke all on function public.pvos_invoke_authority_monitor(boolean) from public,anon,authenticated;
grant execute on function public.pvos_invoke_authority_monitor(boolean) to service_role;
