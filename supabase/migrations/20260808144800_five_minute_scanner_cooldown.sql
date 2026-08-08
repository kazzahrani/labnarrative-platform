-- Extend the post-outreach scanner cooldown from two minutes to five minutes.
-- Raw browser activity remains available for diagnostics; only the sales summary changes.

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
engaged_sessions_after_cooldown as (
  select
    e.site_id,
    e.session_id,
    min(e.created_at) as engaged_at,
    min(e.path) as engaged_path
  from public.concept_events e
  join first_outreach o
    on o.site_id = e.site_id
   and e.created_at >= o.first_outreach_at + interval '5 minutes'
  where e.event_type = 'engaged_visit'
  group by e.site_id, e.session_id
),
scanner_burst_sessions as (
  select distinct candidate.site_id, candidate.session_id
  from engaged_sessions_after_cooldown candidate
  join lateral (
    select
      count(distinct nearby.session_id) as nearby_sessions,
      count(distinct nearby.engaged_path) as nearby_paths
    from engaged_sessions_after_cooldown nearby
    where nearby.site_id = candidate.site_id
      and nearby.engaged_at between candidate.engaged_at - interval '10 seconds'
                                and candidate.engaged_at + interval '10 seconds'
  ) burst on true
  where burst.nearby_sessions >= 3
    and burst.nearby_paths >= 2
),
qualified_sessions as (
  select
    e.site_id,
    e.session_id,
    e.engaged_at
  from engaged_sessions_after_cooldown e
  left join scanner_burst_sessions scanner
    on scanner.site_id = e.site_id
   and scanner.session_id = e.session_id
  where scanner.session_id is null
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
      and q.session_id is not null
  )::bigint as page_views,
  count(distinct q.session_id)::bigint as visits,
  count(e.id) filter (
    where e.event_type = 'cta_click'
      and q.session_id is not null
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

comment on view public.sales_concept_summary is
  'Sales analytics summary. Headline visits require engagement at least five minutes after real outreach and exclude rapid multi-session/multi-page bursts characteristic of email-security scanners. Raw page loads remain available only as diagnostics.';

revoke all on public.sales_concept_summary from anon, authenticated;
grant select on public.sales_concept_summary to authenticated;
