-- Authority monitoring: source collection is separate from human source checks.
create table public.pvos_authority_sources (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),
 source_key text not null,name text not null,url text not null,method text not null check(method in ('atom','rss','manual')),
 feed_url text,coverage_note text not null,active boolean not null default true,created_at timestamptz not null default now(),unique(organization_id,source_key)
);
create table public.pvos_authority_collection_runs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),source_id uuid not null references public.pvos_authority_sources(id),
 started_at timestamptz not null default now(),completed_at timestamptz not null default now(),status text not null check(status in ('ok','error')),
 http_status integer,entry_count integer not null default 0,new_count integer not null default 0,oldest_published_at timestamptz,newest_published_at timestamptz,feed_sha256 text,error text
);
create table public.pvos_authority_notices (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),source_id uuid not null references public.pvos_authority_sources(id),
 title text not null,url text not null,published_at timestamptz,summary text,content_sha256 text not null,
 first_seen_at timestamptz not null default now(),baseline boolean not null default false,collection_run_id uuid not null references public.pvos_authority_collection_runs(id),
 unique(source_id,url,content_sha256)
);
create table public.pvos_authority_settings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),company_id uuid not null unique references public.pvos_companies(id),
 enabled boolean not null default true,owner_user_id uuid not null references auth.users(id),reviewer_user_id uuid not null references auth.users(id),
 source_ids uuid[] not null,sop_reference text not null,form_reference text not null,scope_rationale text not null,start_month date not null,
 confirmed_by uuid not null references auth.users(id),confirmed_email text not null,confirmed_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(owner_user_id<>reviewer_user_id)
);
create table public.pvos_authority_periods (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),company_id uuid not null references public.pvos_companies(id),setting_id uuid not null references public.pvos_authority_settings(id),
 period_start date not null,period_end date not null,due_at timestamptz not null,status text not null default 'draft' check(status in ('draft','pending_review','returned','approved')),
 revision integer not null default 1,owner_user_id uuid not null references auth.users(id),reviewer_user_id uuid not null references auth.users(id),
 settings_snapshot jsonb not null,product_snapshot jsonb not null,task_id uuid references public.pvos_tasks(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,period_start),check(period_start<=period_end),check(owner_user_id<>reviewer_user_id)
);
create table public.pvos_authority_checks (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),company_id uuid not null references public.pvos_companies(id),period_id uuid not null references public.pvos_authority_periods(id),
 source_id uuid not null references public.pvos_authority_sources(id),source_snapshot jsonb not null,
 outcome text not null default 'not_checked' check(outcome in ('not_checked','findings','no_relevant_findings','unavailable')),
 notes text,checked_by uuid references auth.users(id),checked_email text,checked_at timestamptz,unique(period_id,source_id)
);
create table public.pvos_authority_findings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),company_id uuid not null references public.pvos_companies(id),period_id uuid not null references public.pvos_authority_periods(id),check_id uuid not null references public.pvos_authority_checks(id),
 notice_id uuid references public.pvos_authority_notices(id),title text not null,url text not null,notice_snapshot jsonb,
 product_ids uuid[] not null default '{}',assessment text not null check(assessment in ('relevant','not_relevant','needs_review')),
 rationale text not null,created_by uuid not null references auth.users(id),created_email text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index pvos_authority_finding_notice on public.pvos_authority_findings(check_id,notice_id) where notice_id is not null;
create table public.pvos_authority_reviews (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),company_id uuid not null references public.pvos_companies(id),period_id uuid not null references public.pvos_authority_periods(id),
 cycle integer not null,status text not null default 'pending' check(status in ('pending','approved','returned')),
 sent_by uuid not null references auth.users(id),sent_email text not null,sent_at timestamptz not null default now(),submission_note text not null,
 assigned_to uuid not null references auth.users(id),assigned_email text not null,snapshot jsonb not null,
 decided_by uuid references auth.users(id),decided_email text,decided_role text,decided_at timestamptz,decision_note text,
 unique(period_id,cycle),check(sent_by<>assigned_to)
);
create unique index pvos_authority_review_pending on public.pvos_authority_reviews(period_id) where status='pending';
create table public.pvos_authority_records (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.pvos_organizations(id),company_id uuid not null references public.pvos_companies(id),period_id uuid not null unique references public.pvos_authority_periods(id),review_id uuid not null unique references public.pvos_authority_reviews(id),
 snapshot jsonb not null,snapshot_sha256 text not null,completed_at timestamptz not null default now()
);
-- New authority findings share the existing Signal Review queue; no literature rows are fabricated.
alter table public.pvos_signal_reviews alter column literature_item_id drop not null;
alter table public.pvos_signal_reviews add column authority_finding_id uuid unique references public.pvos_authority_findings(id);
alter table public.pvos_signal_reviews add constraint pvos_signal_review_origin check(num_nonnulls(literature_item_id,authority_finding_id)=1);
alter table public.pvos_authority_sources enable row level security;
revoke all on public.pvos_authority_sources from public,anon,authenticated;
grant select on public.pvos_authority_sources to authenticated;
grant all on public.pvos_authority_sources to service_role;
create policy pvos_authority_sources_read on public.pvos_authority_sources for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_sources_org on public.pvos_authority_sources(organization_id);
alter table public.pvos_authority_collection_runs enable row level security;
revoke all on public.pvos_authority_collection_runs from public,anon,authenticated;
grant select on public.pvos_authority_collection_runs to authenticated;
grant all on public.pvos_authority_collection_runs to service_role;
create policy pvos_authority_collection_runs_read on public.pvos_authority_collection_runs for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_collection_runs_org on public.pvos_authority_collection_runs(organization_id);
alter table public.pvos_authority_notices enable row level security;
revoke all on public.pvos_authority_notices from public,anon,authenticated;
grant select on public.pvos_authority_notices to authenticated;
grant all on public.pvos_authority_notices to service_role;
create policy pvos_authority_notices_read on public.pvos_authority_notices for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_notices_org on public.pvos_authority_notices(organization_id);
alter table public.pvos_authority_settings enable row level security;
revoke all on public.pvos_authority_settings from public,anon,authenticated;
grant select on public.pvos_authority_settings to authenticated;
grant all on public.pvos_authority_settings to service_role;
create policy pvos_authority_settings_read on public.pvos_authority_settings for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_settings_org on public.pvos_authority_settings(organization_id);
alter table public.pvos_authority_periods enable row level security;
revoke all on public.pvos_authority_periods from public,anon,authenticated;
grant select on public.pvos_authority_periods to authenticated;
grant all on public.pvos_authority_periods to service_role;
create policy pvos_authority_periods_read on public.pvos_authority_periods for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_periods_org on public.pvos_authority_periods(organization_id);
alter table public.pvos_authority_checks enable row level security;
revoke all on public.pvos_authority_checks from public,anon,authenticated;
grant select on public.pvos_authority_checks to authenticated;
grant all on public.pvos_authority_checks to service_role;
create policy pvos_authority_checks_read on public.pvos_authority_checks for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_checks_org on public.pvos_authority_checks(organization_id);
alter table public.pvos_authority_findings enable row level security;
revoke all on public.pvos_authority_findings from public,anon,authenticated;
grant select on public.pvos_authority_findings to authenticated;
grant all on public.pvos_authority_findings to service_role;
create policy pvos_authority_findings_read on public.pvos_authority_findings for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_findings_org on public.pvos_authority_findings(organization_id);
alter table public.pvos_authority_reviews enable row level security;
revoke all on public.pvos_authority_reviews from public,anon,authenticated;
grant select on public.pvos_authority_reviews to authenticated;
grant all on public.pvos_authority_reviews to service_role;
create policy pvos_authority_reviews_read on public.pvos_authority_reviews for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_reviews_org on public.pvos_authority_reviews(organization_id);
alter table public.pvos_authority_records enable row level security;
revoke all on public.pvos_authority_records from public,anon,authenticated;
grant select on public.pvos_authority_records to authenticated;
grant all on public.pvos_authority_records to service_role;
create policy pvos_authority_records_read on public.pvos_authority_records for select to authenticated using(public.pvos_is_member(organization_id));
create index pvos_authority_records_org on public.pvos_authority_records(organization_id);
create index pvos_authority_collection_runs_source_id on public.pvos_authority_collection_runs(source_id);
create index pvos_authority_notices_collection_run_id on public.pvos_authority_notices(collection_run_id);
create index pvos_authority_settings_owner_user_id on public.pvos_authority_settings(owner_user_id);
create index pvos_authority_settings_reviewer_user_id on public.pvos_authority_settings(reviewer_user_id);
create index pvos_authority_settings_confirmed_by on public.pvos_authority_settings(confirmed_by);
create index pvos_authority_periods_setting_id on public.pvos_authority_periods(setting_id);
create index pvos_authority_periods_owner_user_id on public.pvos_authority_periods(owner_user_id);
create index pvos_authority_periods_reviewer_user_id on public.pvos_authority_periods(reviewer_user_id);
create index pvos_authority_periods_task_id on public.pvos_authority_periods(task_id);
create index pvos_authority_checks_company_id on public.pvos_authority_checks(company_id);
create index pvos_authority_checks_source_id on public.pvos_authority_checks(source_id);
create index pvos_authority_checks_checked_by on public.pvos_authority_checks(checked_by);
create index pvos_authority_findings_company_id on public.pvos_authority_findings(company_id);
create index pvos_authority_findings_period_id on public.pvos_authority_findings(period_id);
create index pvos_authority_findings_notice_id on public.pvos_authority_findings(notice_id);
create index pvos_authority_findings_created_by on public.pvos_authority_findings(created_by);
create index pvos_authority_reviews_company_id on public.pvos_authority_reviews(company_id);
create index pvos_authority_reviews_sent_by on public.pvos_authority_reviews(sent_by);
create index pvos_authority_reviews_assigned_to on public.pvos_authority_reviews(assigned_to);
create index pvos_authority_reviews_decided_by on public.pvos_authority_reviews(decided_by);
create index pvos_authority_records_company_id on public.pvos_authority_records(company_id);
create index pvos_authority_notices_period on public.pvos_authority_notices(source_id,first_seen_at,published_at);

create function public.pvos_authority_catalogue(p_org uuid) returns void language plpgsql security definer set search_path='' as $fn$
begin
 insert into public.pvos_authority_sources(organization_id,source_key,name,url,method,feed_url,coverage_note) values
 (p_org,'sfda','SFDA safety alerts','https://www.sfda.gov.sa/en/safety-alerts','manual',null,'Manual check required. No automatic SFDA website coverage is claimed.'),
 (p_org,'mhra_dsu','MHRA Drug Safety Update','https://www.gov.uk/drug-safety-update','atom','https://www.gov.uk/drug-safety-update.atom','Automatic collection covers the published Drug Safety Update feed only. Recent feed window; confirm archives and additional SOP-required channels manually.'),
 (p_org,'fda_medwatch','FDA MedWatch safety alerts','https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program','rss','https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml','Automatic collection covers the MedWatch feed only, including non-drug notices. It does not cover all FDA safety channels or historical archives.'),
 (p_org,'ema','EMA safety communications','https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/direct-healthcare-professional-communications','manual',null,'Manual check required. No automatic EMA website coverage is claimed.')
 on conflict(organization_id,source_key) do nothing;
end $fn$;
-- Prepare official source candidates, not company applicability decisions.
do $seed$ declare org uuid;begin for org in select id from public.pvos_organizations loop perform public.pvos_authority_catalogue(org);end loop;end $seed$;

create function public.pvos_authority_owner_access(p_period_id uuid,p_revision integer) returns public.pvos_authority_periods language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;v_role text;
begin
 select * into p from public.pvos_authority_periods where id=p_period_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(p.organization_id) then raise exception 'Monitoring period not accessible';end if;
 select role into v_role from public.pvos_memberships where organization_id=p.organization_id and user_id=auth.uid();
 if p.owner_user_id is distinct from auth.uid() and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only the monitoring owner or QPPV administrator can prepare this period';end if;
 if p.status not in ('draft','returned') then raise exception 'Submitted or approved monitoring records are locked';end if;
 if p_revision is null or p.revision<>p_revision then raise exception 'Period changed. Refresh before saving';end if;
 return p;
end $fn$;

create function public.pvos_materialize_authority_periods(p_company_id uuid default null) returns integer language plpgsql security definer set search_path='' as $fn$
declare s public.pvos_authority_settings%rowtype;m date;finish date;pid uuid;tid uuid;n integer:=0;ss jsonb;ps jsonb;
begin
 -- Internal entry point: executable only by service_role; authenticated callers use the scoped settings RPC.
 for s in select * from public.pvos_authority_settings where enabled and (p_company_id is null or company_id=p_company_id) loop
  m:=s.start_month;
  while m<=date_trunc('month',now() at time zone 'Asia/Riyadh')::date loop
   finish:=(m+interval '1 month'-interval '1 day')::date;
   select to_jsonb(s)||jsonb_build_object('owner_email',(select email from auth.users where id=s.owner_user_id),'reviewer_email',(select email from auth.users where id=s.reviewer_user_id),'company_name',(select name from public.pvos_companies where id=s.company_id),'cadence','monthly','who_reference','https://www.who.int/publications/m/item/list-of-who-listed-authorities-wlas') into ss;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'brand_name',brand_name,'active_ingredient',active_ingredient) order by id),'[]') into ps from public.pvos_products where company_id=s.company_id;
   insert into public.pvos_authority_periods(organization_id,company_id,setting_id,period_start,period_end,due_at,owner_user_id,reviewer_user_id,settings_snapshot,product_snapshot)
   values(s.organization_id,s.company_id,s.id,m,finish,(finish+1)::timestamp at time zone 'Asia/Riyadh',s.owner_user_id,s.reviewer_user_id,ss,ps) on conflict(company_id,period_start) do nothing returning id into pid;
   if pid is not null then
    insert into public.pvos_tasks(organization_id,company_id,title,activity_type,source,status,owner_user_id,due_at,metadata)
    values(s.organization_id,s.company_id,'Authority monitoring · '||to_char(m,'Mon YYYY'),'authority_monitoring','system','not_started',s.owner_user_id,(finish+1)::timestamp at time zone 'Asia/Riyadh',jsonb_build_object('authority_period_id',pid)) returning id into tid;
    update public.pvos_authority_periods set task_id=tid where id=pid;
    insert into public.pvos_authority_checks(organization_id,company_id,period_id,source_id,source_snapshot)
    select s.organization_id,s.company_id,pid,id,to_jsonb(src) from public.pvos_authority_sources src where src.id=any(s.source_ids) and src.organization_id=s.organization_id;
    n:=n+1;
   end if;
   m:=(m+interval '1 month')::date;
  end loop;
 end loop;
 return n;
end $fn$;

create function public.pvos_configure_authority_monitoring(p_company_id uuid,p_owner_id uuid,p_reviewer_id uuid,p_source_ids uuid[],p_sop text,p_form text,p_scope text,p_start_month date,p_enabled boolean default true) returns void language plpgsql security definer set search_path='' as $fn$
declare c public.pvos_companies%rowtype;v_role text;v_email text;
begin
 select * into c from public.pvos_companies where id=p_company_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(c.organization_id) then raise exception 'Company not accessible';end if;
 select role into v_role from public.pvos_memberships where organization_id=c.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'A QPPV administrator must confirm monitoring scope';end if;
 if p_owner_id is null or p_reviewer_id is null or p_owner_id=p_reviewer_id or not exists(select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_owner_id) or not exists(select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_reviewer_id and role in ('admin','qppv','deputy_qppv')) then raise exception 'Choose a workspace owner and a different QPPV reviewer';end if;
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

create function public.pvos_record_authority_check(p_period_id uuid,p_revision integer,p_check_id uuid,p_outcome text,p_notes text) returns void language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;v_email text;
begin
 p:=public.pvos_authority_owner_access(p_period_id,p_revision);
 if p_outcome not in ('findings','no_relevant_findings','unavailable') or p_outcome is null or nullif(trim(p_notes),'') is null or length(p_notes)>10000 then raise exception 'Record the source outcome and scope/evidence or failure note';end if;
 if not exists(select 1 from public.pvos_authority_checks where id=p_check_id and period_id=p.id) then raise exception 'Source check not found';end if;
 if p_outcome='findings' and not exists(select 1 from public.pvos_authority_findings where check_id=p_check_id) then raise exception 'Record the finding before confirming this source check';end if;
 if p_outcome='no_relevant_findings' and exists(select 1 from public.pvos_authority_findings where check_id=p_check_id and assessment in ('relevant','needs_review')) then raise exception 'Resolve relevant or unresolved findings before recording no relevant findings';end if;
 select email into v_email from auth.users where id=auth.uid();
 update public.pvos_authority_checks set outcome=p_outcome,notes=trim(p_notes),checked_by=auth.uid(),checked_email=v_email,checked_at=now() where id=p_check_id;
 update public.pvos_authority_periods set revision=revision+1,updated_at=now() where id=p.id;
 update public.pvos_tasks set status='in_progress' where id=p.task_id;
end $fn$;

create function public.pvos_record_authority_finding(p_period_id uuid,p_revision integer,p_check_id uuid,p_finding_id uuid,p_notice_id uuid,p_title text,p_url text,p_product_ids uuid[],p_assessment text,p_rationale text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;ch public.pvos_authority_checks%rowtype;nt public.pvos_authority_notices%rowtype;fid uuid;v_email text;v_title text;v_url text;
begin
 p:=public.pvos_authority_owner_access(p_period_id,p_revision);
 select * into ch from public.pvos_authority_checks where id=p_check_id and period_id=p.id;
 if not found then raise exception 'Source check not found';end if;
 if p_assessment not in ('relevant','not_relevant','needs_review') or p_assessment is null or nullif(trim(p_rationale),'') is null or length(p_rationale)>10000 then raise exception 'Record a finding assessment and rationale';end if;
 if exists(select 1 from unnest(coalesce(p_product_ids,'{}')) chosen(product_id) where not exists(select 1 from public.pvos_products where pvos_products.id=chosen.product_id and company_id=p.company_id)) then raise exception 'Affected products must belong to this company';end if;
 if p_assessment='relevant' and coalesce(cardinality(p_product_ids),0)=0 then raise exception 'Select the affected company products';end if;
 v_title:=trim(p_title);v_url:=trim(p_url);
 if p_notice_id is not null then
  select * into nt from public.pvos_authority_notices where id=p_notice_id and source_id=ch.source_id and organization_id=p.organization_id;
  if not found then raise exception 'Collected notice does not belong to this source';end if;
  v_title:=nt.title;v_url:=nt.url;
 end if;
 if nullif(v_title,'') is null or length(v_title)>2000 or v_url is null or v_url!~'^https://[^/@:?#[:space:]]+(:[0-9]+)?([/?#][^[:space:]]*)?$' or length(v_url)>4000 then raise exception 'Provide a finding title and HTTPS evidence URL without credentials';end if;
 select email into v_email from auth.users where id=auth.uid();
 if p_finding_id is not null then
  if exists(select 1 from public.pvos_signal_reviews where authority_finding_id=p_finding_id) then raise exception 'Escalated finding evidence is locked; assess it in Signal Review';end if;
  update public.pvos_authority_findings set title=v_title,url=v_url,notice_id=p_notice_id,notice_snapshot=case when p_notice_id is not null then to_jsonb(nt) end,product_ids=coalesce(p_product_ids,'{}'),assessment=p_assessment,rationale=trim(p_rationale),updated_at=now() where id=p_finding_id and check_id=ch.id and period_id=p.id returning id into fid;
  if fid is null then raise exception 'Finding not found';end if;
 else
  insert into public.pvos_authority_findings(organization_id,company_id,period_id,check_id,notice_id,title,url,notice_snapshot,product_ids,assessment,rationale,created_by,created_email)
  values(p.organization_id,p.company_id,p.id,ch.id,p_notice_id,v_title,v_url,case when p_notice_id is not null then to_jsonb(nt) end,coalesce(p_product_ids,'{}'),p_assessment,trim(p_rationale),auth.uid(),v_email) returning id into fid;
 end if;
 -- A changed finding invalidates any earlier source conclusion.
 update public.pvos_authority_checks set outcome='not_checked',checked_by=null,checked_email=null,checked_at=null where id=ch.id;
 update public.pvos_authority_periods set revision=revision+1,updated_at=now() where id=p.id;
 return fid;
end $fn$;

create function public.pvos_escalate_authority_finding(p_finding_id uuid,p_revision integer) returns uuid language plpgsql security definer set search_path='' as $fn$
declare f public.pvos_authority_findings%rowtype;p public.pvos_authority_periods%rowtype;sid uuid;ps jsonb;
begin
 select * into f from public.pvos_authority_findings where id=p_finding_id;
 if not found then raise exception 'Finding not accessible';end if;
 p:=public.pvos_authority_owner_access(f.period_id,p_revision);
 if f.assessment<>'relevant' then raise exception 'Only human-confirmed relevant findings can enter Signal Review';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'brand_name',brand_name,'active_ingredient',active_ingredient) order by id),'[]') into ps from public.pvos_products where id=any(f.product_ids) and company_id=p.company_id;
 insert into public.pvos_signal_reviews(organization_id,company_id,product_id,authority_finding_id,status,assessment,metadata)
 values(p.organization_id,p.company_id,f.product_ids[1],f.id,'new','unassessed',jsonb_build_object('source','authority','authority_period_id',p.id,'title',f.title,'url',f.url,'finding_snapshot',to_jsonb(f),'product_snapshot',ps,'authority_name',(select source_snapshot->>'name' from public.pvos_authority_checks where id=f.check_id)))
 on conflict(authority_finding_id) do nothing returning id into sid;
 if sid is null then select id into sid from public.pvos_signal_reviews where authority_finding_id=f.id;end if;
 update public.pvos_authority_periods set revision=revision+1,updated_at=now() where id=p.id;
 return sid;
end $fn$;

create function public.pvos_authority_new_notices(p_period_id uuid,p_after timestamptz,p_source_id uuid default null) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from public.pvos_authority_periods p join public.pvos_authority_checks c on c.period_id=p.id join public.pvos_authority_notices n on n.source_id=c.source_id where p.id=p_period_id and (p_source_id is null or c.source_id=p_source_id) and n.first_seen_at>p_after and
 ((n.published_at at time zone 'Asia/Riyadh')::date between p.period_start and p.period_end or ((not n.baseline or n.published_at is null) and (n.first_seen_at at time zone 'Asia/Riyadh')::date between p.period_start and p.period_end)));
$fn$;

create function public.pvos_submit_authority_period(p_period_id uuid,p_revision integer,p_note text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare p public.pvos_authority_periods%rowtype;rid uuid;v_email text;assigned_email text;snap jsonb;v_cycle integer;
begin
 p:=public.pvos_authority_owner_access(p_period_id,p_revision);
 if now()<p.due_at then raise exception 'The monitoring period is still open. Prepare now and submit after the period ends';end if;
 if auth.uid()=p.reviewer_user_id then raise exception 'The assigned reviewer cannot submit their own monitoring record';end if;
 if not exists(select 1 from public.pvos_memberships where organization_id=p.organization_id and user_id=p.reviewer_user_id and role in ('admin','qppv','deputy_qppv')) then raise exception 'The assigned QPPV reviewer is no longer eligible';end if;
 if nullif(trim(p_note),'') is null or length(p_note)>10000 then raise exception 'Record the monitoring conclusion before sending';end if;
 if not exists(select 1 from public.pvos_authority_checks where period_id=p.id) or exists(select 1 from public.pvos_authority_checks c where c.period_id=p.id and (c.outcome in ('not_checked','unavailable') or public.pvos_authority_new_notices(p.id,c.checked_at,c.source_id))) then raise exception 'Complete every source check, resolve unavailable sources and review newly collected notices before sending';end if;
 if exists(select 1 from public.pvos_authority_findings where period_id=p.id and assessment='needs_review') then raise exception 'Resolve findings that still need review';end if;
 select email into v_email from auth.users where id=auth.uid();select email into assigned_email from auth.users where id=p.reviewer_user_id;
 select jsonb_build_object('period',to_jsonb(p),'checks',coalesce((select jsonb_agg(to_jsonb(c) order by id) from public.pvos_authority_checks c where period_id=p.id),'[]'),'findings',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('signal_review_id',(select id from public.pvos_signal_reviews where authority_finding_id=f.id)) order by id) from public.pvos_authority_findings f where period_id=p.id),'[]'),
 'collection_history',coalesce((select jsonb_agg(to_jsonb(r) order by started_at) from public.pvos_authority_collection_runs r where source_id in (select source_id from public.pvos_authority_checks where period_id=p.id) and started_at>=p.period_start::timestamp at time zone 'Asia/Riyadh' and started_at<=now()),'[]'),'conclusion',trim(p_note),'evidence_scope','Publisher feed/manual reference snapshots; document bytes are not included') into snap;
 select coalesce(max(cycle),0)+1 into v_cycle from public.pvos_authority_reviews where period_id=p.id;
 insert into public.pvos_authority_reviews(organization_id,company_id,period_id,cycle,sent_by,sent_email,submission_note,assigned_to,assigned_email,snapshot)
 values(p.organization_id,p.company_id,p.id,v_cycle,auth.uid(),v_email,trim(p_note),p.reviewer_user_id,assigned_email,snap) returning id into rid;
 update public.pvos_authority_periods set status='pending_review',revision=revision+1,updated_at=now() where id=p.id;
 update public.pvos_tasks set status='awaiting_review',reviewer_user_id=p.reviewer_user_id where id=p.task_id;
 return rid;
end $fn$;

create function public.pvos_decide_authority_review(p_review_id uuid,p_decision text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare r public.pvos_authority_reviews%rowtype;p public.pvos_authority_periods%rowtype;v_role text;v_email text;record_id uuid;snap jsonb;
begin
 -- Lock the period first, matching all preparation/submission calls.
 select * into r from public.pvos_authority_reviews where id=p_review_id;
 if not found then raise exception 'Review not accessible';end if;
 select * into p from public.pvos_authority_periods where id=r.period_id for update;
 select * into r from public.pvos_authority_reviews where id=p_review_id for update;
 if auth.uid() is null or not public.pvos_is_member(r.organization_id) or r.assigned_to<>auth.uid() or r.sent_by=auth.uid() then raise exception 'Only the named independent reviewer can decide';end if;
 select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'A QPPV reviewer must decide';end if;
 if r.status<>'pending' or p.status<>'pending_review' then raise exception 'Review already decided';end if;
 if p_decision not in ('approved','returned') or p_decision is null or nullif(trim(p_reason),'') is null or length(p_reason)>10000 then raise exception 'Choose Approve or Return and record the conclusion/reason';end if;
 if p_decision='approved' and public.pvos_authority_new_notices(p.id,r.sent_at) then raise exception 'Additional notices arrived after submission. Return the record for review';end if;
 select email into v_email from auth.users where id=auth.uid();
 update public.pvos_authority_reviews set status=p_decision,decided_by=auth.uid(),decided_email=v_email,decided_role=v_role,decided_at=now(),decision_note=trim(p_reason) where id=r.id returning * into r;
 update public.pvos_authority_periods set status=case when p_decision='approved' then 'approved' else 'returned' end,revision=revision+1,updated_at=now() where id=p.id;
 if p_decision='approved' then
  snap:=jsonb_build_object('submitted_evidence',r.snapshot,'first_review',jsonb_build_object('user_id',r.sent_by,'email',r.sent_email,'submitted_at',r.sent_at,'conclusion',r.submission_note),'second_review',jsonb_build_object('user_id',r.decided_by,'email',r.decided_email,'role',r.decided_role,'decided_at',r.decided_at,'decision',r.status,'conclusion',r.decision_note),'review_id',r.id,'cycle',r.cycle);
  insert into public.pvos_authority_records(organization_id,company_id,period_id,review_id,snapshot,snapshot_sha256) values(p.organization_id,p.company_id,p.id,r.id,snap,encode(extensions.digest(snap::text,'sha256'),'hex')) returning id into record_id;
  insert into public.pvos_task_evidence(task_id,title,evidence_type,external_url,version,uploaded_by) values(p.task_id,'Approved authority monitoring record','document','https://pvos.site/pvos/signal?authorityPeriod='||p.id::text,'authority-monitoring-v1',auth.uid());
  update public.pvos_tasks set status='complete',completed_at=now() where id=p.task_id;
 else update public.pvos_tasks set status='in_progress' where id=p.task_id;end if;
 return record_id;
end $fn$;

create function public.pvos_assess_authority_signal(p_review_id uuid,p_assessment text,p_status text,p_notes text) returns void language plpgsql security definer set search_path='' as $fn$
declare r public.pvos_signal_reviews%rowtype;v_role text;v_email text;
begin
 select * into r from public.pvos_signal_reviews where id=p_review_id and authority_finding_id is not null for update;
 if not found or auth.uid() is null or not public.pvos_is_member(r.organization_id) then raise exception 'Signal assessment not accessible';end if;
 select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only a QPPV reviewer can assess an authority finding';end if;
 if p_assessment not in ('unassessed','potential_signal','no_signal_concern','needs_more_info') or p_assessment is null or p_status not in ('under_review','closed') or p_status is null or (p_status='closed' and p_assessment<>'no_signal_concern') or nullif(trim(p_notes),'') is null then raise exception 'Record an assessment rationale; potential signals remain under review';end if;
 select email into v_email from auth.users where id=auth.uid();
 update public.pvos_signal_reviews set assessment=p_assessment,status=p_status,notes=trim(p_notes),reviewer_user_id=auth.uid(),reviewed_at=now(),metadata=metadata||jsonb_build_object('reviewer_email',v_email,'reviewer_role',v_role) where id=r.id;
end $fn$;

create function public.pvos_guard_authority_signal() returns trigger language plpgsql set search_path='' as $fn$
begin
 if (case when tg_op='DELETE' then old.authority_finding_id is not null else new.authority_finding_id is not null or (tg_op='UPDATE' and old.authority_finding_id is not null) end) and current_user not in ('postgres','supabase_admin','service_role') then raise exception 'Use the authority Signal Review workflow';end if;
 if tg_op='DELETE' and old.authority_finding_id is not null then raise exception 'Authority signal history must be retained';end if;
 return coalesce(new,old);
end $fn$;
create trigger pvos_guard_authority_signal before insert or update or delete on public.pvos_signal_reviews for each row execute function public.pvos_guard_authority_signal();

create function public.pvos_audit_authority() returns trigger language plpgsql security definer set search_path='' as $fn$
declare d jsonb;email text;
begin
 d:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select auth.users.email into email from auth.users where id=auth.uid();
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata)
 values((d->>'organization_id')::uuid,(d->>'company_id')::uuid,auth.uid(),replace(tg_table_name,'pvos_',''),(d->>'id')::uuid,lower(tg_op),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end,jsonb_build_object('actor_email',email,'period_id',coalesce(d->>'period_id',case when tg_table_name='pvos_authority_periods' then d->>'id' end),'reason',coalesce(d->>'decision_note',d->>'rationale',d->>'notes',d->>'scope_rationale')));
 return coalesce(new,old);
end $fn$;
create function public.pvos_authority_immutable() returns trigger language plpgsql set search_path='' as $fn$
begin raise exception 'Recorded authority evidence is append-only';end $fn$;
create function public.pvos_guard_authority_review() returns trigger language plpgsql set search_path='' as $fn$
begin
 if tg_op='DELETE' or old.status<>'pending' or (to_jsonb(new)-array['status','decided_by','decided_email','decided_role','decided_at','decision_note']) is distinct from (to_jsonb(old)-array['status','decided_by','decided_email','decided_role','decided_at','decision_note']) then raise exception 'Submitted evidence and decided review cycles are immutable';end if;
 return new;
end $fn$;
create trigger pvos_authority_review_guard before update or delete on public.pvos_authority_reviews for each row execute function public.pvos_guard_authority_review();
create trigger pvos_authority_settings_audit after insert or update or delete on public.pvos_authority_settings for each row execute function public.pvos_audit_authority();
create trigger pvos_authority_periods_audit after insert or update or delete on public.pvos_authority_periods for each row execute function public.pvos_audit_authority();
create trigger pvos_authority_checks_audit after insert or update or delete on public.pvos_authority_checks for each row execute function public.pvos_audit_authority();
create trigger pvos_authority_findings_audit after insert or update or delete on public.pvos_authority_findings for each row execute function public.pvos_audit_authority();
create trigger pvos_authority_reviews_audit after insert or update or delete on public.pvos_authority_reviews for each row execute function public.pvos_audit_authority();
create trigger pvos_authority_records_audit after insert or update or delete on public.pvos_authority_records for each row execute function public.pvos_audit_authority();
create trigger pvos_authority_notices_immutable before update or delete on public.pvos_authority_notices for each row execute function public.pvos_authority_immutable();
create trigger pvos_authority_records_immutable before update or delete on public.pvos_authority_records for each row execute function public.pvos_authority_immutable();
create trigger pvos_authority_collection_runs_immutable before update or delete on public.pvos_authority_collection_runs for each row execute function public.pvos_authority_immutable();
revoke all on function public.pvos_authority_catalogue(uuid) from public,anon,authenticated;
revoke all on function public.pvos_authority_owner_access(uuid,integer) from public,anon,authenticated;
revoke all on function public.pvos_materialize_authority_periods(uuid) from public,anon,authenticated;
revoke all on function public.pvos_authority_new_notices(uuid,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.pvos_configure_authority_monitoring(uuid,uuid,uuid,uuid[],text,text,text,date,boolean) from public,anon,authenticated;
grant execute on function public.pvos_configure_authority_monitoring(uuid,uuid,uuid,uuid[],text,text,text,date,boolean) to authenticated;
revoke all on function public.pvos_record_authority_check(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pvos_record_authority_check(uuid,integer,uuid,text,text) to authenticated;
revoke all on function public.pvos_record_authority_finding(uuid,integer,uuid,uuid,uuid,text,text,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.pvos_record_authority_finding(uuid,integer,uuid,uuid,uuid,text,text,uuid[],text,text) to authenticated;
revoke all on function public.pvos_escalate_authority_finding(uuid,integer) from public,anon,authenticated;
grant execute on function public.pvos_escalate_authority_finding(uuid,integer) to authenticated;
revoke all on function public.pvos_submit_authority_period(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.pvos_submit_authority_period(uuid,integer,text) to authenticated;
revoke all on function public.pvos_decide_authority_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pvos_decide_authority_review(uuid,text,text) to authenticated;
revoke all on function public.pvos_assess_authority_signal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.pvos_assess_authority_signal(uuid,text,text,text) to authenticated;
revoke all on function public.pvos_guard_authority_signal() from public,anon,authenticated;
revoke all on function public.pvos_audit_authority() from public,anon,authenticated;
revoke all on function public.pvos_authority_immutable() from public,anon,authenticated;
revoke all on function public.pvos_guard_authority_review() from public,anon,authenticated;
grant execute on function public.pvos_materialize_authority_periods(uuid) to service_role;

create function public.pvos_add_manual_authority_source(p_organization_id uuid,p_name text,p_url text,p_coverage_note text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare source_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.pvos_memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('admin','qppv','deputy_qppv')) then raise exception 'Only a QPPV administrator can add an authority';end if;
 if nullif(trim(p_name),'') is null or length(p_name)>500 or p_url is null or p_url!~'^https://[^/@:?#[:space:]]+(:[0-9]+)?([/?#][^[:space:]]*)?$' or length(p_url)>4000 or nullif(trim(p_coverage_note),'') is null or length(p_coverage_note)>10000 then raise exception 'Record the authority name, HTTPS source URL and monitoring scope';end if;
 insert into public.pvos_authority_sources(organization_id,source_key,name,url,method,coverage_note) values(p_organization_id,'manual_'||gen_random_uuid()::text,trim(p_name),trim(p_url),'manual',trim(p_coverage_note)) returning id into source_id;
 return source_id;
end $fn$;
revoke all on function public.pvos_add_manual_authority_source(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.pvos_add_manual_authority_source(uuid,text,text,text) to authenticated;
create trigger pvos_authority_sources_audit after insert on public.pvos_authority_sources for each row execute function public.pvos_audit_authority();
