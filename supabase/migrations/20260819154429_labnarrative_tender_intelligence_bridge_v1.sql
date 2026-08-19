create table if not exists public.tender_source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.tender_data_sources(id) on delete restrict,
  ingestion_run_id uuid references public.tender_ingestion_runs(id) on delete set null,
  source_record_id text not null,
  source_url text,
  fetched_at timestamptz not null default now(),
  published_at timestamptz,
  content_type text,
  http_status integer,
  content_hash text not null,
  raw_text text,
  payload jsonb not null default '{}'::jsonb,
  document_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_id, source_record_id, content_hash)
);

create index if not exists tender_source_records_source_fetched_idx
  on public.tender_source_records(source_id, fetched_at desc);
create index if not exists tender_source_records_record_idx
  on public.tender_source_records(source_id, source_record_id, fetched_at desc);

alter table public.tender_source_records enable row level security;
revoke all on table public.tender_source_records from anon, authenticated;
grant select on table public.tender_source_records to authenticated;
create policy tender_source_records_authenticated_read
  on public.tender_source_records for select to authenticated
  using (true);

alter table public.tenders
  add column if not exists source_record_uuid uuid references public.tender_source_records(id) on delete set null,
  add column if not exists normalized_at timestamptz not null default now();
create index if not exists tenders_source_record_uuid_idx on public.tenders(source_record_uuid);

alter table public.ln_opportunities
  add column if not exists source_tender_id uuid references public.tenders(id) on delete set null;
create unique index if not exists ln_opportunities_org_source_tender_unique
  on public.ln_opportunities(org_id, source_tender_id)
  where source_tender_id is not null;
create index if not exists ln_opportunities_source_tender_idx on public.ln_opportunities(source_tender_id);

drop policy if exists public_read_demo_tender_matches on public.tender_matches;
alter table public.tender_matches drop constraint if exists tender_matches_company_id_fkey;
alter table public.tender_matches rename column company_id to org_id;
alter table public.tender_matches
  add constraint tender_matches_org_id_fkey foreign key (org_id) references public.ln_organizations(id) on delete cascade;
alter table public.tender_matches drop constraint if exists tender_matches_decision_check;
alter table public.tender_matches
  add constraint tender_matches_decision_check check (decision in ('BID','REVIEW','NO-BID'));
alter table public.tender_matches
  add column if not exists exact_count integer not null default 0,
  add column if not exists equivalent_count integer not null default 0,
  add column if not exists missing_count integer not null default 0,
  add column if not exists stock_available_count integer not null default 0,
  add column if not exists requires_sourcing_count integer not null default 0,
  add column if not exists brand_category_fit numeric not null default 0 check (brand_category_fit between 0 and 1),
  add column if not exists supply_fit numeric not null default 0.5 check (supply_fit between 0 and 1),
  add column if not exists documentation_fit numeric not null default 0.5 check (documentation_fit between 0 and 1),
  add column if not exists match_version text not null default 'deterministic_v1',
  add column if not exists score_components jsonb not null default '{}'::jsonb;
create index if not exists tender_matches_org_score_idx on public.tender_matches(org_id, score desc, computed_at desc);
create policy ln_tender_matches_select on public.tender_matches
  for select to authenticated using (public.ln_is_org_member(org_id));

alter table public.tender_decisions drop constraint if exists tender_decisions_company_id_fkey;
alter table public.tender_decisions rename column company_id to org_id;
alter table public.tender_decisions
  add constraint tender_decisions_org_id_fkey foreign key (org_id) references public.ln_organizations(id) on delete cascade;
alter table public.tender_decisions drop constraint if exists tender_decisions_decision_check;
alter table public.tender_decisions
  add constraint tender_decisions_decision_check check (decision in ('BID','REVIEW','NO-BID'));
create index if not exists tender_decisions_org_tender_idx on public.tender_decisions(org_id, tender_id, decided_at desc);
create policy ln_tender_decisions_select on public.tender_decisions
  for select to authenticated using (public.ln_is_org_member(org_id));
create policy ln_tender_decisions_write on public.tender_decisions
  for all to authenticated
  using (public.ln_has_role(org_id,array['tenders','sales','management']))
  with check (public.ln_has_role(org_id,array['tenders','sales','management']));

alter table public.tender_documents drop constraint if exists tender_documents_company_id_fkey;
alter table public.tender_documents rename column company_id to org_id;
alter table public.tender_documents
  add constraint tender_documents_org_id_fkey foreign key (org_id) references public.ln_organizations(id) on delete cascade;
alter table public.tender_documents
  add column if not exists opportunity_id uuid references public.ln_opportunities(id) on delete set null,
  add column if not exists ln_tender_id uuid references public.ln_tenders(id) on delete set null;
drop index if exists public.tender_documents_company_created_idx;
create index if not exists tender_documents_org_created_idx on public.tender_documents(org_id, created_at desc);
create index if not exists tender_documents_opportunity_idx on public.tender_documents(opportunity_id);
create index if not exists tender_documents_ln_tender_idx on public.tender_documents(ln_tender_id);

grant select, insert, update, delete on table public.tender_documents to authenticated;
create policy ln_tender_documents_select on public.tender_documents
  for select to authenticated using (public.ln_is_org_member(org_id));
create policy ln_tender_documents_write on public.tender_documents
  for all to authenticated
  using (public.ln_has_role(org_id,array['tenders','sales','management']))
  with check (public.ln_has_role(org_id,array['tenders','sales','management']));

alter table public.tender_item_matches drop constraint if exists tender_item_matches_catalog_item_id_fkey;
alter table public.tender_item_matches drop constraint if exists tender_item_matches_document_item_id_catalog_item_id_key;
alter table public.tender_item_matches rename column catalog_item_id to product_id;
alter table public.tender_item_matches
  add constraint tender_item_matches_product_id_fkey foreign key (product_id) references public.ln_products(id) on delete set null,
  add constraint tender_item_matches_document_item_id_product_id_key unique(document_item_id, product_id);
drop index if exists public.tender_item_matches_catalog_idx;
create index if not exists tender_item_matches_product_idx on public.tender_item_matches(product_id);

grant select, insert, update, delete on table public.tender_document_items to authenticated;
grant select, insert, update, delete on table public.tender_item_matches to authenticated;
create policy ln_tender_document_items_select on public.tender_document_items
  for select to authenticated using (exists (
    select 1 from public.tender_documents d
    where d.id=tender_document_items.document_id and public.ln_is_org_member(d.org_id)
  ));
create policy ln_tender_document_items_write on public.tender_document_items
  for all to authenticated
  using (exists (
    select 1 from public.tender_documents d
    where d.id=tender_document_items.document_id and public.ln_has_role(d.org_id,array['tenders','sales','management'])
  ))
  with check (exists (
    select 1 from public.tender_documents d
    where d.id=tender_document_items.document_id and public.ln_has_role(d.org_id,array['tenders','sales','management'])
  ));
create policy ln_tender_item_matches_select on public.tender_item_matches
  for select to authenticated using (exists (
    select 1
    from public.tender_document_items i
    join public.tender_documents d on d.id=i.document_id
    where i.id=tender_item_matches.document_item_id and public.ln_is_org_member(d.org_id)
  ));
create policy ln_tender_item_matches_write on public.tender_item_matches
  for all to authenticated
  using (exists (
    select 1
    from public.tender_document_items i
    join public.tender_documents d on d.id=i.document_id
    where i.id=tender_item_matches.document_item_id and public.ln_has_role(d.org_id,array['tenders','sales','management'])
  ))
  with check (exists (
    select 1
    from public.tender_document_items i
    join public.tender_documents d on d.id=i.document_id
    where i.id=tender_item_matches.document_item_id and public.ln_has_role(d.org_id,array['tenders','sales','management'])
  ));

comment on table public.tender_source_records is 'Immutable-ish raw source snapshots for Saudi/GCC tender ingestion. Normalize into public.tenders; never use this table directly as a tenant opportunity.';
comment on table public.tender_matches is 'Company-specific explainable match/recommendation between one shared public tender and one LabNarrative SaaS organization.';
comment on column public.ln_opportunities.source_tender_id is 'Optional provenance link from the tenant operational opportunity back to the shared normalized public tender.';
