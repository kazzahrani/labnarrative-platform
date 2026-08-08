create table if not exists public.concept_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  session_id uuid not null,
  event_type text not null default 'page_view' check (event_type in ('page_view', 'cta_click')),
  path text not null default '/' check (char_length(path) <= 500),
  source text not null default '' check (char_length(source) <= 120),
  medium text not null default '' check (char_length(medium) <= 120),
  campaign text not null default '' check (char_length(campaign) <= 180),
  created_at timestamptz not null default now()
);

comment on table public.concept_events is
  'Privacy-minimal sales analytics for public LabNarrative concept websites. Stores no IP address, fingerprint, name, email, or user-agent.';

comment on column public.concept_events.session_id is
  'Random per-tab browser session UUID kept in sessionStorage; used only to count visits without persistent visitor tracking.';

create index if not exists concept_events_site_created_idx
  on public.concept_events (site_id, created_at desc);

create index if not exists concept_events_site_session_idx
  on public.concept_events (site_id, session_id);

alter table public.concept_events enable row level security;

revoke all on table public.concept_events from anon, authenticated;
grant insert on table public.concept_events to anon, authenticated;
grant select on table public.concept_events to authenticated;
grant usage, select on sequence public.concept_events_id_seq to anon, authenticated;

drop policy if exists "Public visitors can record concept analytics" on public.concept_events;
create policy "Public visitors can record concept analytics"
  on public.concept_events
  for insert
  to anon, authenticated
  with check (
    event_type in ('page_view', 'cta_click')
    and path like '/%'
    and exists (
      select 1
      from public.sites s
      where s.id = site_id
        and s.status = 'concept'
    )
  );

drop policy if exists "Administrators can view concept analytics" on public.concept_events;
create policy "Administrators can view concept analytics"
  on public.concept_events
  for select
  to authenticated
  using (public.is_labnarrative_admin());

create or replace view public.sales_concept_summary
with (security_invoker = true)
as
select
  s.id as site_id,
  s.slug,
  s.status as site_status,
  s.outreach_status,
  coalesce(nullif(s.content ->> 'piName', ''), s.slug) as pi_name,
  coalesce(s.content ->> 'institution', '') as institution,
  count(e.id) filter (where e.event_type = 'page_view')::bigint as page_views,
  count(distinct e.session_id) filter (where e.event_type = 'page_view')::bigint as visits,
  count(e.id) filter (where e.event_type = 'cta_click')::bigint as cta_clicks,
  min(e.created_at) filter (where e.event_type = 'page_view') as first_viewed_at,
  max(e.created_at) filter (where e.event_type = 'page_view') as last_viewed_at
from public.sites s
left join public.concept_events e on e.site_id = s.id
where s.status in ('concept', 'live')
  and public.is_labnarrative_admin()
group by s.id, s.slug, s.status, s.outreach_status, s.content;

revoke all on public.sales_concept_summary from anon, authenticated;
grant select on public.sales_concept_summary to authenticated;
