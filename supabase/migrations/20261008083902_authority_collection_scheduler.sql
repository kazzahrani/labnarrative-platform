alter table public.pvos_authority_notices add column publisher_url text;
create or replace function public.pvos_register_authority_collection(p_source_id uuid,p_started_at timestamptz,p_http_status integer,p_feed_sha256 text,p_notices jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare s public.pvos_authority_sources%rowtype;rid uuid;baseline boolean;new_count integer;entries integer;oldest timestamptz;newest timestamptz;
begin
 select * into s from public.pvos_authority_sources where id=p_source_id for update;
 if not found or s.method='manual' then raise exception 'Automatic source not found';end if;
 if p_notices is null or p_http_status is null or p_feed_sha256 is null or jsonb_typeof(p_notices)<>'array' or jsonb_array_length(p_notices)=0 or jsonb_array_length(p_notices)>1000 or p_http_status<>200 or p_feed_sha256!~'^[a-f0-9]{64}$' then raise exception 'Invalid collection result';end if;
 if exists(select 1 from jsonb_array_elements(p_notices) n where nullif(trim(n->>'title'),'') is null or n->>'url' is null or n->>'content_sha256' is null or (n->>'url')!~'^https://[^/@:?#[:space:]]+(:[0-9]+)?([/?#][^[:space:]]*)?$' or (n->>'content_sha256')!~'^[a-f0-9]{64}$') then raise exception 'Invalid notice evidence';end if;
 baseline:=not exists(select 1 from public.pvos_authority_notices where source_id=s.id);
 select count(*),min((n->>'published_at')::timestamptz),max((n->>'published_at')::timestamptz) into entries,oldest,newest from jsonb_array_elements(p_notices) n;
 select count(*) into new_count from (select distinct n->>'url' as url,n->>'content_sha256' as hash from jsonb_array_elements(p_notices) n) x where not exists(select 1 from public.pvos_authority_notices where source_id=s.id and url=x.url and content_sha256=x.hash);
 insert into public.pvos_authority_collection_runs(organization_id,source_id,started_at,completed_at,status,http_status,entry_count,new_count,oldest_published_at,newest_published_at,feed_sha256)
 values(s.organization_id,s.id,p_started_at,now(),'ok',p_http_status,entries,new_count,oldest,newest,p_feed_sha256) returning id into rid;
 insert into public.pvos_authority_notices(organization_id,source_id,title,url,published_at,summary,content_sha256,baseline,collection_run_id,publisher_url)
 select s.organization_id,s.id,n->>'title',n->>'url',(n->>'published_at')::timestamptz,n->>'summary',n->>'content_sha256',baseline,rid,n->>'publisher_url' from jsonb_array_elements(p_notices) n on conflict(source_id,url,content_sha256) do nothing;
 return jsonb_build_object('run_id',rid,'new_count',new_count,'baseline',baseline,'entry_count',entries);
end $fn$;

create index pvos_authority_findings_check_id on public.pvos_authority_findings(check_id);
alter table public.pvos_authority_periods add constraint pvos_authority_revision_positive check(revision>0);
alter table public.pvos_authority_reviews add constraint pvos_authority_decision_evidence check(
 (status='pending' and decided_by is null and decided_at is null and decided_email is null and decision_note is null)
 or (status<>'pending' and decided_by is not null and decided_at is not null and decided_email is not null and decided_role is not null and decision_note is not null and length(trim(decision_note))>0 and (status='withdrawn' or decided_by=assigned_to))
);
-- Collection runs independently of company assessment; company periods are created only for confirmed enabled settings.
select cron.schedule('pvos-authority-monitor','15 */4 * * *','select public.pvos_invoke_authority_monitor(false);');
