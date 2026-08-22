create table if not exists public.ln_supplier_quote_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ln_organizations(id) on delete cascade,
  quote_id uuid not null references public.ln_supplier_quote_intakes(id) on delete cascade,
  source_file_name text not null,
  parser text not null,
  status text not null default 'proposed' check (status in ('proposed','partially_confirmed','confirmed','rejected')),
  row_count integer not null default 0,
  matched_count integer not null default 0,
  quality numeric not null default 0,
  parser_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ln_supplier_quote_extraction_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.ln_organizations(id) on delete cascade,
  run_id uuid not null references public.ln_supplier_quote_extraction_runs(id) on delete cascade,
  quote_id uuid not null references public.ln_supplier_quote_intakes(id) on delete cascade,
  source_row_number integer not null,
  source_sheet text,
  source_page integer,
  raw_text text not null,
  extracted_item_code text,
  extracted_description text,
  extracted_quantity numeric,
  extracted_unit text,
  extracted_unit_cost numeric,
  extracted_moq numeric,
  extracted_lead_time_days integer,
  extracted_manufacturer text,
  extracted_catalog_no text,
  matched_sourcing_id uuid references public.ln_tender_sourcing_items(id) on delete set null,
  matched_requirement_id uuid references public.tender_requirements(id) on delete set null,
  match_method text,
  match_confidence numeric not null default 0,
  extraction_confidence numeric not null default 0,
  status text not null default 'proposed' check (status in ('proposed','confirmed','rejected')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  unique(run_id,source_row_number,source_sheet)
);

create index if not exists ln_supplier_quote_extraction_runs_quote_idx on public.ln_supplier_quote_extraction_runs(quote_id,created_at desc);
create index if not exists ln_supplier_quote_extraction_proposals_run_idx on public.ln_supplier_quote_extraction_proposals(run_id,status,source_row_number);
create index if not exists ln_supplier_quote_extraction_proposals_sourcing_idx on public.ln_supplier_quote_extraction_proposals(matched_sourcing_id);

alter table public.ln_supplier_quote_extraction_runs enable row level security;
alter table public.ln_supplier_quote_extraction_proposals enable row level security;

drop policy if exists "members read supplier quote extraction runs" on public.ln_supplier_quote_extraction_runs;
create policy "members read supplier quote extraction runs" on public.ln_supplier_quote_extraction_runs for select to authenticated using (public.ln_is_org_member(org_id));
drop policy if exists "members read supplier quote extraction proposals" on public.ln_supplier_quote_extraction_proposals;
create policy "members read supplier quote extraction proposals" on public.ln_supplier_quote_extraction_proposals for select to authenticated using (public.ln_is_org_member(org_id));

create or replace function public.ln_save_supplier_quote_extraction_run(
  p_quote_id uuid,
  p_source_file_name text,
  p_parser text,
  p_quality numeric,
  p_parser_metadata jsonb,
  p_rows jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_quote public.ln_supplier_quote_intakes%rowtype;
  v_run uuid;
  v_row jsonb;
  v_count integer:=0;
  v_matched integer:=0;
begin
  select * into v_quote from public.ln_supplier_quote_intakes where id=p_quote_id;
  if v_quote.id is null then raise exception 'Supplier quote intake not found'; end if;
  if not public.ln_has_role(v_quote.org_id,array['tenders','sales','finance','management']) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then raise exception 'Rows must be an array'; end if;
  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb)) > 1000 then raise exception 'Extraction run exceeds 1000 rows'; end if;

  insert into public.ln_supplier_quote_extraction_runs(org_id,quote_id,source_file_name,parser,status,row_count,matched_count,quality,parser_metadata,created_by)
  values(v_quote.org_id,v_quote.id,coalesce(nullif(trim(p_source_file_name),''),'supplier-quote'),coalesce(nullif(trim(p_parser),''),'unknown'),'proposed',0,0,greatest(0,least(coalesce(p_quality,0),1)),coalesce(p_parser_metadata,'{}'::jsonb),auth.uid())
  returning id into v_run;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    insert into public.ln_supplier_quote_extraction_proposals(
      org_id,run_id,quote_id,source_row_number,source_sheet,source_page,raw_text,
      extracted_item_code,extracted_description,extracted_quantity,extracted_unit,extracted_unit_cost,extracted_moq,extracted_lead_time_days,
      extracted_manufacturer,extracted_catalog_no,matched_sourcing_id,matched_requirement_id,match_method,match_confidence,extraction_confidence
    ) values (
      v_quote.org_id,v_run,v_quote.id,
      greatest(1,coalesce((v_row->>'source_row_number')::integer,1)),nullif(v_row->>'source_sheet',''),nullif(v_row->>'source_page','')::integer,coalesce(v_row->>'raw_text',''),
      nullif(v_row->>'item_code',''),nullif(v_row->>'description',''),nullif(v_row->>'quantity','')::numeric,nullif(v_row->>'unit',''),nullif(v_row->>'unit_cost','')::numeric,nullif(v_row->>'moq','')::numeric,nullif(v_row->>'lead_time_days','')::integer,
      nullif(v_row->>'manufacturer',''),nullif(v_row->>'catalog_no',''),nullif(v_row->>'matched_sourcing_id','')::uuid,nullif(v_row->>'matched_requirement_id','')::uuid,nullif(v_row->>'match_method',''),greatest(0,least(coalesce(nullif(v_row->>'match_confidence','')::numeric,0),1)),greatest(0,least(coalesce(nullif(v_row->>'extraction_confidence','')::numeric,0),1))
    );
    v_count:=v_count+1;
    if nullif(v_row->>'matched_sourcing_id','') is not null then v_matched:=v_matched+1; end if;
  end loop;

  update public.ln_supplier_quote_extraction_runs set row_count=v_count,matched_count=v_matched where id=v_run;
  insert into public.ln_activity_log(org_id,actor_user_id,activity_type,entity_type,entity_id,summary,detail)
  values(v_quote.org_id,auth.uid(),'supplier_quote_extracted','supplier_quote',v_quote.id,'Supplier quote document extracted into human-review proposals',jsonb_build_object('run_id',v_run,'rows',v_count,'matched',v_matched,'parser',p_parser));
  return v_run;
end $$;

create or replace function public.ln_get_supplier_quote_extraction_runs(p_quote_id uuid)
returns table(id uuid,source_file_name text,parser text,status text,row_count integer,matched_count integer,quality numeric,parser_metadata jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_quote public.ln_supplier_quote_intakes%rowtype;
begin
  select * into v_quote from public.ln_supplier_quote_intakes where id=p_quote_id;
  if v_quote.id is null then raise exception 'Supplier quote intake not found'; end if;
  if not public.ln_is_org_member(v_quote.org_id) then raise exception 'Not authorized'; end if;
  return query select r.id,r.source_file_name,r.parser,r.status,r.row_count,r.matched_count,r.quality,r.parser_metadata,r.created_at from public.ln_supplier_quote_extraction_runs r where r.quote_id=p_quote_id order by r.created_at desc;
end $$;

create or replace function public.ln_get_supplier_quote_extraction_proposals(p_run_id uuid)
returns table(
  id uuid,source_row_number integer,source_sheet text,source_page integer,raw_text text,
  extracted_item_code text,extracted_description text,extracted_quantity numeric,extracted_unit text,extracted_unit_cost numeric,extracted_moq numeric,extracted_lead_time_days integer,extracted_manufacturer text,extracted_catalog_no text,
  matched_sourcing_id uuid,matched_requirement_id uuid,matched_item_code text,matched_requested_item text,matched_requested_quantity numeric,matched_unit text,match_method text,match_confidence numeric,extraction_confidence numeric,status text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_run public.ln_supplier_quote_extraction_runs%rowtype;
begin
  select * into v_run from public.ln_supplier_quote_extraction_runs where id=p_run_id;
  if v_run.id is null then raise exception 'Extraction run not found'; end if;
  if not public.ln_is_org_member(v_run.org_id) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.source_row_number,p.source_sheet,p.source_page,p.raw_text,p.extracted_item_code,p.extracted_description,p.extracted_quantity,p.extracted_unit,p.extracted_unit_cost,p.extracted_moq,p.extracted_lead_time_days,p.extracted_manufacturer,p.extracted_catalog_no,
         p.matched_sourcing_id,p.matched_requirement_id,r.item_code,coalesce(nullif(r.name_en,''),nullif(r.name_ar,''),'Unnamed tender item'),r.quantity,r.unit,p.match_method,p.match_confidence,p.extraction_confidence,p.status
  from public.ln_supplier_quote_extraction_proposals p
  left join public.tender_requirements r on r.id=p.matched_requirement_id
  where p.run_id=p_run_id order by p.source_row_number,p.id;
end $$;

create or replace function public.ln_confirm_supplier_quote_extraction_proposal(p_proposal_id uuid,p_sourcing_id uuid default null)
returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_prop public.ln_supplier_quote_extraction_proposals%rowtype;
  v_quote public.ln_supplier_quote_intakes%rowtype;
  v_source public.ln_tender_sourcing_items%rowtype;
  v_item uuid;
  v_remaining integer;
  v_confirmed integer;
begin
  select * into v_prop from public.ln_supplier_quote_extraction_proposals where id=p_proposal_id for update;
  if v_prop.id is null then raise exception 'Extraction proposal not found'; end if;
  select * into v_quote from public.ln_supplier_quote_intakes where id=v_prop.quote_id for update;
  if not public.ln_has_role(v_quote.org_id,array['tenders','sales','finance','management']) then raise exception 'Not authorized'; end if;
  if v_prop.status<>'proposed' then raise exception 'Proposal is no longer pending'; end if;
  if v_prop.extracted_unit_cost is null or v_prop.extracted_unit_cost<=0 then raise exception 'A positive extracted unit cost is required'; end if;

  select * into v_source from public.ln_tender_sourcing_items where id=coalesce(p_sourcing_id,v_prop.matched_sourcing_id);
  if v_source.id is null or v_source.org_id<>v_quote.org_id or v_source.ln_tender_id<>v_quote.ln_tender_id then raise exception 'Choose a valid sourcing line from this tender'; end if;

  select public.ln_upsert_supplier_quote_item(
    v_quote.id,v_source.id,v_prop.extracted_unit_cost,v_prop.extracted_quantity,v_prop.extracted_moq,v_prop.extracted_lead_time_days,v_prop.extracted_manufacturer,v_prop.extracted_catalog_no,
    concat('Confirmed from automatic document extraction',case when v_prop.source_sheet is not null then ' · '||v_prop.source_sheet else '' end,' · row ',v_prop.source_row_number)
  ) into v_item;

  update public.ln_supplier_quote_extraction_proposals set status='confirmed',matched_sourcing_id=v_source.id,matched_requirement_id=v_source.requirement_id,confirmed_by=auth.uid(),confirmed_at=now() where id=v_prop.id;
  select count(*) filter(where status='proposed'),count(*) filter(where status='confirmed') into v_remaining,v_confirmed from public.ln_supplier_quote_extraction_proposals where run_id=v_prop.run_id;
  update public.ln_supplier_quote_extraction_runs set status=case when v_remaining=0 and v_confirmed>0 then 'confirmed' when v_confirmed>0 then 'partially_confirmed' else status end where id=v_prop.run_id;
  return v_item;
end $$;

create or replace function public.ln_reject_supplier_quote_extraction_proposal(p_proposal_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prop public.ln_supplier_quote_extraction_proposals%rowtype; v_remaining integer; v_confirmed integer;
begin
  select * into v_prop from public.ln_supplier_quote_extraction_proposals where id=p_proposal_id for update;
  if v_prop.id is null then raise exception 'Extraction proposal not found'; end if;
  if not public.ln_has_role(v_prop.org_id,array['tenders','sales','finance','management']) then raise exception 'Not authorized'; end if;
  if v_prop.status<>'proposed' then return; end if;
  update public.ln_supplier_quote_extraction_proposals set status='rejected',rejected_by=auth.uid(),rejected_at=now() where id=v_prop.id;
  select count(*) filter(where status='proposed'),count(*) filter(where status='confirmed') into v_remaining,v_confirmed from public.ln_supplier_quote_extraction_proposals where run_id=v_prop.run_id;
  update public.ln_supplier_quote_extraction_runs set status=case when v_remaining=0 and v_confirmed>0 then 'confirmed' when v_remaining=0 then 'rejected' when v_confirmed>0 then 'partially_confirmed' else status end where id=v_prop.run_id;
end $$;

grant execute on function public.ln_save_supplier_quote_extraction_run(uuid,text,text,numeric,jsonb,jsonb) to authenticated;
grant execute on function public.ln_get_supplier_quote_extraction_runs(uuid) to authenticated;
grant execute on function public.ln_get_supplier_quote_extraction_proposals(uuid) to authenticated;
grant execute on function public.ln_confirm_supplier_quote_extraction_proposal(uuid,uuid) to authenticated;
grant execute on function public.ln_reject_supplier_quote_extraction_proposal(uuid) to authenticated;
