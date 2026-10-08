-- Dalal-supplied overview template: readiness and human conclusions, not certification.
create table public.pvos_inspection_checklist_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.pvos_organizations(id),
 company_id uuid not null references public.pvos_companies(id), template_version text not null default 'dalal-overview-v1',
 requirement_key text not null, area_order integer not null, area_title text not null, title text not null,
 owner_user_id uuid references auth.users(id), sop_reference text, preparation_note text,
 revision integer not null default 1 check(revision>0),
 status text not null default 'missing_evidence' check(status in ('missing_evidence','awaiting_review','reviewed','not_applicable')),
 current_review_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,template_version,requirement_key)
);
create table public.pvos_inspection_checklist_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.pvos_organizations(id),
 company_id uuid not null references public.pvos_companies(id), item_id uuid not null references public.pvos_inspection_checklist_items(id),
 kind text not null check(kind in ('task','document','literature','handover','external')), reference_id uuid,
 title text not null, external_url text, version text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check((kind='external' and reference_id is null and external_url is not null and length(trim(version))>0)
 or (kind<>'external' and reference_id is not null and external_url is null))
);
create unique index pvos_inspection_link_reference on public.pvos_inspection_checklist_links(item_id,kind,reference_id) where reference_id is not null;
create table public.pvos_inspection_checklist_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.pvos_organizations(id),
 company_id uuid not null references public.pvos_companies(id), item_id uuid not null references public.pvos_inspection_checklist_items(id),
 item_revision integer not null, decision text not null check(decision in ('reviewed','missing_evidence','not_applicable')),
 conclusion text not null check(length(trim(conclusion))>0), reviewed_by uuid not null references auth.users(id),
 reviewer_email text not null, reviewer_role text not null, reviewed_at timestamptz not null default now(), snapshot jsonb not null
);
alter table public.pvos_inspection_checklist_items add constraint pvos_inspection_current_review_fk foreign key(current_review_id) references public.pvos_inspection_checklist_reviews(id);
create index pvos_inspection_items_scope on public.pvos_inspection_checklist_items(organization_id,company_id,area_order,requirement_key);
create index pvos_inspection_links_scope on public.pvos_inspection_checklist_links(organization_id,item_id);
create index pvos_inspection_reviews_scope on public.pvos_inspection_checklist_reviews(organization_id,item_id,reviewed_at);
alter table public.pvos_inspection_checklist_items enable row level security;
revoke all on public.pvos_inspection_checklist_items from public,anon,authenticated;
grant select on public.pvos_inspection_checklist_items to authenticated;
create policy pvos_inspection_checklist_items_read on public.pvos_inspection_checklist_items for select to authenticated using(public.pvos_is_member(organization_id));
alter table public.pvos_inspection_checklist_links enable row level security;
revoke all on public.pvos_inspection_checklist_links from public,anon,authenticated;
grant select on public.pvos_inspection_checklist_links to authenticated;
create policy pvos_inspection_checklist_links_read on public.pvos_inspection_checklist_links for select to authenticated using(public.pvos_is_member(organization_id));
alter table public.pvos_inspection_checklist_reviews enable row level security;
revoke all on public.pvos_inspection_checklist_reviews from public,anon,authenticated;
grant select on public.pvos_inspection_checklist_reviews to authenticated;
create policy pvos_inspection_checklist_reviews_read on public.pvos_inspection_checklist_reviews for select to authenticated using(public.pvos_is_member(organization_id));

create function public.pvos_inspection_template() returns jsonb language sql immutable set search_path='' as $fn$
select $template$[{"key": "01.01", "area_order": 1, "area_title": "QPPV", "title": "Qualifications"}, {"key": "01.02", "area_order": 1, "area_title": "QPPV", "title": "Job description"}, {"key": "01.03", "area_order": 1, "area_title": "QPPV", "title": "System oversight"}, {"key": "01.04", "area_order": 1, "area_title": "QPPV", "title": "Back-up process and delegation"}, {"key": "02.01", "area_order": 2, "area_title": "PSMF", "title": "Org chart"}, {"key": "02.02", "area_order": 2, "area_title": "PSMF", "title": "Content"}, {"key": "02.03", "area_order": 2, "area_title": "PSMF", "title": "Maintenance and submission"}, {"key": "03.01", "area_order": 3, "area_title": "Written instructions (SOPs, manuals, etc)", "title": "Procedures"}, {"key": "03.02", "area_order": 3, "area_title": "Written instructions (SOPs, manuals, etc)", "title": "Manuals"}, {"key": "03.03", "area_order": 3, "area_title": "Written instructions (SOPs, manuals, etc)", "title": "Process for SOP training"}, {"key": "04.01", "area_order": 4, "area_title": "Contracts, agreements", "title": "Contracts"}, {"key": "04.02", "area_order": 4, "area_title": "Contracts, agreements", "title": "Agreements"}, {"key": "05.01", "area_order": 5, "area_title": "Periodic safety update reports", "title": "PSUR scheduling"}, {"key": "05.02", "area_order": 5, "area_title": "Periodic safety update reports", "title": "Format and content"}, {"key": "05.03", "area_order": 5, "area_title": "Periodic safety update reports", "title": "Quality control of PSURs"}, {"key": "05.04", "area_order": 5, "area_title": "Periodic safety update reports", "title": "Timeliness of submission"}, {"key": "05.05", "area_order": 5, "area_title": "Periodic safety update reports", "title": "Assessment report comments"}, {"key": "06.01", "area_order": 6, "area_title": "Risk-management system", "title": "Risk-management plan format and content"}, {"key": "06.02", "area_order": 6, "area_title": "Risk-management system", "title": "Compliance with risk-minimisation measures which are beyond routine pharmacovigilance"}, {"key": "07.01", "area_order": 7, "area_title": "Management and reporting of adverse reactions", "title": "Data collection methods"}, {"key": "07.02", "area_order": 7, "area_title": "Management and reporting of adverse reactions", "title": "Assessments of seriousness, causality and expectedness"}, {"key": "07.03", "area_order": 7, "area_title": "Management and reporting of adverse reactions", "title": "Medical review"}, {"key": "07.04", "area_order": 7, "area_title": "Management and reporting of adverse reactions", "title": "QC process"}, {"key": "07.05", "area_order": 7, "area_title": "Management and reporting of adverse reactions", "title": "Submissions and follow up processes"}, {"key": "07.06", "area_order": 7, "area_title": "Management and reporting of adverse reactions", "title": "Literature screening"}, {"key": "08.01", "area_order": 8, "area_title": "Computerised systems used for pharmacovigilance activities", "title": "Backup and disaster recovery process"}, {"key": "09.01", "area_order": 9, "area_title": "Clinical trials", "title": "SUSAR reporting"}, {"key": "09.02", "area_order": 9, "area_title": "Clinical trials", "title": "Consistency between the IB and SPC when marketed products are used in CT"}, {"key": "09.03", "area_order": 9, "area_title": "Clinical trials", "title": "Reconciliation of SAEs between clinical trial and pharmacovigilance databases"}, {"key": "09.04", "area_order": 9, "area_title": "Clinical trials", "title": "Others"}, {"key": "10.01", "area_order": 10, "area_title": "Signal management", "title": "Dataset used for conducting signal detection (inclusion of information from all relevant sources)"}, {"key": "10.02", "area_order": 10, "area_title": "Signal management", "title": "Periodicity of data review"}, {"key": "10.03", "area_order": 10, "area_title": "Signal management", "title": "Signal validation process"}, {"key": "11.01", "area_order": 11, "area_title": "Product quality", "title": "Review of quality complaints and trend analyses"}, {"key": "11.02", "area_order": 11, "area_title": "Product quality", "title": "Reconciliation between the complaints and safety databases"}, {"key": "12.01", "area_order": 12, "area_title": "Archiving", "title": "Record management"}, {"key": "12.02", "area_order": 12, "area_title": "Archiving", "title": "Archiving facilities"}, {"key": "13.01", "area_order": 13, "area_title": "Quality management system", "title": "Quality system and compliance management"}, {"key": "13.02", "area_order": 13, "area_title": "Quality management system", "title": "Facilities and equipment for pharmacovigilance"}, {"key": "13.03", "area_order": 13, "area_title": "Quality management system", "title": "Training of personnel"}, {"key": "13.04", "area_order": 13, "area_title": "Quality management system", "title": "Audit (internal- and external) and CAPA process"}, {"key": "13.05", "area_order": 13, "area_title": "Quality management system", "title": "Others"}, {"key": "14.01", "area_order": 14, "area_title": "Training", "title": "Initial and on-going training"}, {"key": "14.02", "area_order": 14, "area_title": "Training", "title": "Evaluation of training"}, {"key": "14.03", "area_order": 14, "area_title": "Training", "title": "Maintenance of training records"}, {"key": "15.01", "area_order": 15, "area_title": "Interview", "title": "Interview knowledge"}]$template$::jsonb;
$fn$;

-- Internal resolver. Revoked from API roles; every public entry point checks membership.
-- Source records are frozen exactly at review; external references are not fetched.
create function public.pvos_inspection_sources(p_item_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
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
  elsif l.kind='external' then
   s:=jsonb_build_object('url',l.external_url,'title',l.title,'version',l.version,'retrieved_by_pvos',false); supporting:=true;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('link',to_jsonb(l),'source',s,'supporting',coalesce(supporting,false)));
 end loop;
 return result;
end $fn$;

create function public.pvos_inspection_edit_access(p_item_id uuid,p_revision integer) returns public.pvos_inspection_checklist_items language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; v_role text;
begin
 select * into i from public.pvos_inspection_checklist_items where id=p_item_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(i.organization_id) then raise exception 'Checkpoint not accessible'; end if;
 select role into v_role from public.pvos_memberships where organization_id=i.organization_id and user_id=auth.uid();
 if i.owner_user_id is distinct from auth.uid() and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only the checkpoint owner or QPPV administrator can prepare evidence'; end if;
 if i.revision<>p_revision then raise exception 'Checkpoint changed. Refresh before saving'; end if;
 return i;
end $fn$;

create function public.pvos_get_inspection_checklist(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; r public.pvos_inspection_checklist_reviews%rowtype; sources jsonb; v_status text; support_count integer; result jsonb:='[]';
begin
 if auth.uid() is null or not public.pvos_is_member(p_organization_id) then raise exception 'Workspace not accessible'; end if;
 for i in select * from public.pvos_inspection_checklist_items where organization_id=p_organization_id order by company_id,area_order,requirement_key loop
  sources:=public.pvos_inspection_sources(i.id);
  select count(*) into support_count from jsonb_array_elements(sources) s where (s->>'supporting')::boolean;
  select * into r from public.pvos_inspection_checklist_reviews where id=i.current_review_id;
  v_status:=i.status;
  if i.status in ('reviewed','not_applicable') and (r.item_revision is distinct from i.revision or r.snapshot->'sources' is distinct from sources) then v_status:='needs_review';
  elsif i.status='awaiting_review' and support_count=0 then v_status:='missing_evidence'; end if;
  result:=result||jsonb_build_array(to_jsonb(i)||jsonb_build_object('effective_status',v_status,'support_count',support_count));
 end loop;
 return result;
end $fn$;

create function public.pvos_start_inspection_checklist(p_company_id uuid) returns integer language plpgsql security definer set search_path='' as $fn$
declare c public.pvos_companies%rowtype; v_role text; owner_id uuid; n integer;
begin
 select * into c from public.pvos_companies where id=p_company_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(c.organization_id) then raise exception 'Company not accessible'; end if;
 select role into v_role from public.pvos_memberships where organization_id=c.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'A QPPV administrator must start the company checklist'; end if;
 if exists(select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=c.qppv_user_id) then owner_id:=c.qppv_user_id; end if;
 insert into public.pvos_inspection_checklist_items(organization_id,company_id,requirement_key,area_order,area_title,title,owner_user_id)
 select c.organization_id,c.id,t->>'key',(t->>'area_order')::integer,t->>'area_title',t->>'title',owner_id from jsonb_array_elements(public.pvos_inspection_template()) t
 on conflict(company_id,template_version,requirement_key) do nothing;
 get diagnostics n=row_count; return n;
end $fn$;

create function public.pvos_prepare_inspection_checkpoint(p_item_id uuid,p_revision integer,p_owner_id uuid,p_sop_reference text,p_note text) returns void language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; v_status text;
begin
 i:=public.pvos_inspection_edit_access(p_item_id,p_revision);
 if p_owner_id is not null and not exists(select 1 from public.pvos_memberships where organization_id=i.organization_id and user_id=p_owner_id) then raise exception 'Owner must belong to this workspace'; end if;
 if length(coalesce(p_sop_reference,''))>2000 or length(coalesce(p_note,''))>10000 then raise exception 'Preparation text is too long'; end if;
 select case when exists(select 1 from jsonb_array_elements(public.pvos_inspection_sources(i.id)) s where (s->>'supporting')::boolean) then 'awaiting_review' else 'missing_evidence' end into v_status;
 update public.pvos_inspection_checklist_items set owner_user_id=p_owner_id,sop_reference=nullif(trim(p_sop_reference),''),preparation_note=nullif(trim(p_note),''),revision=revision+1,status=v_status,updated_at=now() where id=i.id;
end $fn$;

create function public.pvos_link_inspection_evidence(p_item_id uuid,p_revision integer,p_kind text,p_reference_id uuid default null,p_title text default null,p_url text default null,p_version text default null) returns uuid language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; link_id uuid; sources jsonb; v_title text;
begin
 i:=public.pvos_inspection_edit_access(p_item_id,p_revision);
 v_title:=nullif(trim(p_title),'');
 if v_title is null or length(v_title)>1000 then raise exception 'Provide an evidence title'; end if;
 if p_kind='external' and (p_url is null or p_url !~ '^https://[^/@[:space:]]+([/:?#][^[:space:]]*)?$' or length(p_url)>4000 or nullif(trim(p_version),'') is null or length(p_version)>500) then raise exception 'Use an HTTPS reference without credentials and record its document version'; end if;
 insert into public.pvos_inspection_checklist_links(organization_id,company_id,item_id,kind,reference_id,title,external_url,version,created_by)
 values(i.organization_id,i.company_id,i.id,p_kind,p_reference_id,v_title,case when p_kind='external' then p_url end,nullif(trim(p_version),''),auth.uid()) returning id into link_id;
 sources:=public.pvos_inspection_sources(i.id);
 if exists(select 1 from jsonb_array_elements(sources) s where s->'link'->>'id'=link_id::text and s->'source'='null'::jsonb) then raise exception 'Evidence is unavailable or belongs to another company'; end if;
 update public.pvos_inspection_checklist_items set revision=revision+1,status=case when exists(select 1 from jsonb_array_elements(sources) s where (s->>'supporting')::boolean) then 'awaiting_review' else 'missing_evidence' end,updated_at=now() where id=i.id;
 return link_id;
end $fn$;

create function public.pvos_unlink_inspection_evidence(p_item_id uuid,p_revision integer,p_link_id uuid) returns void language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype;
begin
 i:=public.pvos_inspection_edit_access(p_item_id,p_revision);
 delete from public.pvos_inspection_checklist_links where id=p_link_id and item_id=i.id;
 if not found then raise exception 'Evidence link not found'; end if;
 update public.pvos_inspection_checklist_items set revision=revision+1,status=case when exists(select 1 from jsonb_array_elements(public.pvos_inspection_sources(i.id)) s where (s->>'supporting')::boolean) then 'awaiting_review' else 'missing_evidence' end,updated_at=now() where id=i.id;
end $fn$;

create function public.pvos_review_inspection_checkpoint(p_item_id uuid,p_revision integer,p_decision text,p_conclusion text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare i public.pvos_inspection_checklist_items%rowtype; v_role text; v_email text; sources jsonb; review_id uuid;
begin
 select * into i from public.pvos_inspection_checklist_items where id=p_item_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(i.organization_id) then raise exception 'Checkpoint not accessible'; end if;
 select role into v_role from public.pvos_memberships where organization_id=i.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv') then raise exception 'A QPPV reviewer must record the conclusion'; end if;
 if i.revision<>p_revision then raise exception 'Checkpoint changed. Refresh before reviewing'; end if;
 if p_decision not in ('reviewed','missing_evidence','not_applicable') or p_decision is null or nullif(trim(p_conclusion),'') is null or length(p_conclusion)>10000 then raise exception 'Choose a review decision and record its conclusion or justification'; end if;
 sources:=public.pvos_inspection_sources(i.id);
 if p_decision='reviewed' and not exists(select 1 from jsonb_array_elements(sources) s where (s->>'supporting')::boolean) then raise exception 'Link supporting evidence before recording Reviewed; task status alone is insufficient'; end if;
 select email into v_email from auth.users where id=auth.uid();
 insert into public.pvos_inspection_checklist_reviews(organization_id,company_id,item_id,item_revision,decision,conclusion,reviewed_by,reviewer_email,reviewer_role,snapshot)
 values(i.organization_id,i.company_id,i.id,i.revision+1,p_decision,trim(p_conclusion),auth.uid(),v_email,v_role,jsonb_build_object('template_source','Dalal-supplied inspection overview; applicability requires human assessment','checkpoint',to_jsonb(i),'sources',sources)) returning id into review_id;
 -- Advance revision on review too: a second stale browser cannot overwrite the latest decision.
 update public.pvos_inspection_checklist_items set status=p_decision,current_review_id=review_id,revision=revision+1,updated_at=now() where id=i.id;
 return review_id;
end $fn$;

create function public.pvos_audit_inspection_checklist() returns trigger language plpgsql security definer set search_path='' as $fn$
declare row_data jsonb; v_email text;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select email into v_email from auth.users where id=auth.uid();
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata)
 values((row_data->>'organization_id')::uuid,(row_data->>'company_id')::uuid,auth.uid(),'inspection_checklist_'||replace(tg_table_name,'pvos_inspection_checklist_',''),(row_data->>'id')::uuid,lower(tg_op),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end,jsonb_build_object('actor_email',v_email,'reason',row_data->>'conclusion'));
 return coalesce(new,old);
end $fn$;
create trigger pvos_inspection_items_audit after insert or update on public.pvos_inspection_checklist_items for each row execute function public.pvos_audit_inspection_checklist();
create trigger pvos_inspection_links_audit after insert or delete on public.pvos_inspection_checklist_links for each row execute function public.pvos_audit_inspection_checklist();
create trigger pvos_inspection_reviews_audit after insert on public.pvos_inspection_checklist_reviews for each row execute function public.pvos_audit_inspection_checklist();

create function public.pvos_inspection_reviews_immutable() returns trigger language plpgsql set search_path='' as $fn$
begin raise exception 'Inspection review history is append-only'; end $fn$;
create trigger pvos_inspection_reviews_immutable before update or delete on public.pvos_inspection_checklist_reviews for each row execute function public.pvos_inspection_reviews_immutable();
revoke all on function public.pvos_inspection_template() from public,anon,authenticated;
revoke all on function public.pvos_inspection_sources(uuid) from public,anon,authenticated;
revoke all on function public.pvos_inspection_edit_access(uuid,integer) from public,anon,authenticated;
revoke all on function public.pvos_audit_inspection_checklist() from public,anon,authenticated;
revoke all on function public.pvos_inspection_reviews_immutable() from public,anon,authenticated;
revoke all on function public.pvos_get_inspection_checklist(uuid) from public,anon,authenticated;
grant execute on function public.pvos_get_inspection_checklist(uuid) to authenticated;
revoke all on function public.pvos_start_inspection_checklist(uuid) from public,anon,authenticated;
grant execute on function public.pvos_start_inspection_checklist(uuid) to authenticated;
revoke all on function public.pvos_prepare_inspection_checkpoint(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pvos_prepare_inspection_checkpoint(uuid,integer,uuid,text,text) to authenticated;
revoke all on function public.pvos_link_inspection_evidence(uuid,integer,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.pvos_link_inspection_evidence(uuid,integer,text,uuid,text,text,text) to authenticated;
revoke all on function public.pvos_unlink_inspection_evidence(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.pvos_unlink_inspection_evidence(uuid,integer,uuid) to authenticated;
revoke all on function public.pvos_review_inspection_checkpoint(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.pvos_review_inspection_checkpoint(uuid,integer,text,text) to authenticated;
