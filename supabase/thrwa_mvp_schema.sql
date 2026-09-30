-- THRWA MVP database schema (prepared for a dedicated Supabase project).
-- Run only in the future THRWA project, never in LabNarrative's trading database.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  name text not null,
  name_ar text,
  vat_number text,
  default_vat numeric not null default 15,
  default_language text not null default 'ar' check (default_language in ('ar','en','bilingual')),
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  name_ar text,
  unit text,
  unit_price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_number text not null,
  customer_name text not null,
  customer_phone text,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  discount numeric not null default 0,
  vat_rate numeric not null default 15,
  subtotal numeric not null default 0,
  vat numeric not null default 0,
  total numeric not null default 0,
  source_text text,
  source_type text default 'text',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  unique (business_id, quote_number)
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  description_ar text,
  quantity numeric not null,
  unit_price numeric not null,
  line_total numeric not null,
  sort_order integer not null default 0
);

create table if not exists public.whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  whatsapp_message_id text unique,
  from_number text,
  message_type text,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.businesses enable row level security;
alter table public.catalog_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.whatsapp_events enable row level security;

create policy "owners read businesses" on public.businesses
for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "owners update businesses" on public.businesses
for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "owners read catalog" on public.catalog_items
for select to authenticated
using (exists (
  select 1 from public.businesses b
  where b.id = catalog_items.business_id and b.owner_user_id = (select auth.uid())
));

create policy "owners manage catalog" on public.catalog_items
for all to authenticated
using (exists (
  select 1 from public.businesses b
  where b.id = catalog_items.business_id and b.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.businesses b
  where b.id = catalog_items.business_id and b.owner_user_id = (select auth.uid())
));

create policy "owners read quotes" on public.quotes
for select to authenticated
using (exists (
  select 1 from public.businesses b
  where b.id = quotes.business_id and b.owner_user_id = (select auth.uid())
));

create policy "owners manage quotes" on public.quotes
for all to authenticated
using (exists (
  select 1 from public.businesses b
  where b.id = quotes.business_id and b.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.businesses b
  where b.id = quotes.business_id and b.owner_user_id = (select auth.uid())
));

create policy "owners read quote items" on public.quote_items
for select to authenticated
using (exists (
  select 1 from public.quotes q join public.businesses b on b.id = q.business_id
  where q.id = quote_items.quote_id and b.owner_user_id = (select auth.uid())
));
