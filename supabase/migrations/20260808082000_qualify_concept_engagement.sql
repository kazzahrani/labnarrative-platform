alter table public.concept_events
  drop constraint if exists concept_events_event_type_check;

alter table public.concept_events
  add constraint concept_events_event_type_check
  check (event_type in ('page_view', 'engaged_visit', 'cta_click'));

comment on column public.concept_events.event_type is
  'page_view is a raw diagnostic load; engaged_visit marks one human-qualified browser session; cta_click is an explicit conversion action.';

create index if not exists concept_events_site_session_type_idx
  on public.concept_events (site_id, session_id, event_type, created_at);

drop policy if exists "Public visitors can record concept analytics" on public.concept_events;
create policy "Public visitors can record concept analytics"
  on public.concept_events
  for insert
  to anon, authenticated
  with check (
    event_type in ('page_view', 'engaged_visit', 'cta_click')
    and path like '/%'
    and exists (
      select 1
      from public.sites s
      where s.id = site_id
        and s.status = 'concept'
    )
  );

create or replace view public.sales_concept_summary
with (security_invoker = true)
as
with first_outreach as (
  select
    om.site_id,
    min(om.sent_at) as first_outreach_at
  from public.outreach_messages om
  where om.site_id is not null
    and om.status = 'sent'
    and coalesce(om.is_test, false) = false
    and om.sent_at is not null
  group by om.site_id
),
qualified_sessions as (
  select
    e.site_id,
    e.session_id,
    min(e.created_at) as engaged_at
  from public.concept_events e
  join first_outreach o
    on o.site_id = e.site_id
   and e.created_at >= o.first_outreach_at
  where e.event_type = 'engaged_visit'
  group by e.site_id, e.session_id
)
select
  s.id as site_id,
  s.slug,
  s.status as site_status,
  s.outreach_status,
  coalesce(nullif(s.content ->> 'piName', ''), s.slug) as pi_name,
  coalesce(s.content ->> 'institution', '') as institution,
  count(e.id) filter (
    where e.event_type = 'page_view'
      and o.first_outreach_at is not null
      and e.created_at >= o.first_outreach_at
      and q.session_id is not null
  )::bigint as page_views,
  count(distinct q.session_id)::bigint as visits,
  count(e.id) filter (
    where e.event_type = 'cta_click'
      and o.first_outreach_at is not null
      and e.created_at >= o.first_outreach_at
  )::bigint as cta_clicks,
  min(q.engaged_at) as first_viewed_at,
  max(q.engaged_at) as last_viewed_at,
  count(e.id) filter (where e.event_type = 'page_view')::bigint as raw_page_views,
  count(distinct e.session_id) filter (where e.event_type = 'page_view')::bigint as raw_visits
from public.sites s
left join first_outreach o on o.site_id = s.id
left join public.concept_events e on e.site_id = s.id
left join qualified_sessions q
  on q.site_id = e.site_id
 and q.session_id = e.session_id
where s.status in ('concept', 'live')
  and public.is_labnarrative_admin()
group by s.id, s.slug, s.status, s.outreach_status, s.content, o.first_outreach_at;

revoke all on public.sales_concept_summary from anon, authenticated;
grant select on public.sales_concept_summary to authenticated;
