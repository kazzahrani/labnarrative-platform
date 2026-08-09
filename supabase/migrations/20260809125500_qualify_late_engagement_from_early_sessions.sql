create or replace view public.sales_concept_summary as
with first_outreach as (
  select om.site_id, min(om.sent_at) as first_outreach_at
  from public.outreach_messages om
  where om.site_id is not null
    and om.status = 'sent'
    and coalesce(om.is_test,false)=false
    and om.sent_at is not null
  group by om.site_id
),
raw_sessions_after_send as (
  select e.site_id,
         e.session_id,
         min(e.created_at) as first_seen_at,
         min(e.path) as first_path
  from public.concept_events e
  join first_outreach o on o.site_id=e.site_id
    and e.created_at >= o.first_outreach_at
  where e.event_type='page_view'
  group by e.site_id,e.session_id
),
engaged_sessions_after_cooldown as (
  select e.site_id,
         e.session_id,
         min(e.created_at) as engaged_at,
         min(e.path) as engaged_path
  from public.concept_events e
  join first_outreach o on o.site_id=e.site_id
    and e.created_at >= o.first_outreach_at + interval '5 minutes'
  where e.event_type='engaged_visit'
  group by e.site_id,e.session_id
),
human_timed_engaged_sessions as (
  select e.site_id,e.session_id,e.engaged_at,e.engaged_path
  from engaged_sessions_after_cooldown e
  join raw_sessions_after_send r
    on r.site_id=e.site_id and r.session_id=e.session_id
  where e.engaged_at >= r.first_seen_at + interval '8 seconds'
),
same_site_scanner_sessions as (
  select distinct candidate.site_id,candidate.session_id
  from human_timed_engaged_sessions candidate
  join lateral (
    select count(distinct nearby.session_id) as nearby_sessions
    from raw_sessions_after_send nearby
    where nearby.site_id=candidate.site_id
      and nearby.first_seen_at >= candidate.engaged_at - interval '1 minute'
      and nearby.first_seen_at <= candidate.engaged_at + interval '1 minute'
  ) burst on true
  where burst.nearby_sessions >= 2
),
cross_site_scanner_sessions as (
  select distinct candidate.site_id,candidate.session_id
  from human_timed_engaged_sessions candidate
  join lateral (
    select count(distinct nearby.site_id) as nearby_sites,
           count(distinct nearby.session_id) as nearby_sessions
    from raw_sessions_after_send nearby
    where nearby.first_seen_at >= candidate.engaged_at - interval '30 seconds'
      and nearby.first_seen_at <= candidate.engaged_at + interval '30 seconds'
  ) burst on true
  where burst.nearby_sites >= 2 and burst.nearby_sessions >= 2
),
qualified_sessions as (
  select e.site_id,e.session_id,e.engaged_at
  from human_timed_engaged_sessions e
  left join same_site_scanner_sessions ss
    on ss.site_id=e.site_id and ss.session_id=e.session_id
  left join cross_site_scanner_sessions cs
    on cs.site_id=e.site_id and cs.session_id=e.session_id
  where ss.session_id is null and cs.session_id is null
)
select s.id as site_id,
       s.slug,
       s.status as site_status,
       s.outreach_status,
       coalesce(nullif(s.content->>'piName',''),s.slug) as pi_name,
       coalesce(s.content->>'institution','') as institution,
       count(e.id) filter (where e.event_type='page_view' and q.session_id is not null) as page_views,
       count(distinct q.session_id) as visits,
       count(e.id) filter (where e.event_type='cta_click' and q.session_id is not null) as cta_clicks,
       min(q.engaged_at) as first_viewed_at,
       max(q.engaged_at) as last_viewed_at,
       count(e.id) filter (where e.event_type='page_view') as raw_page_views,
       count(distinct e.session_id) filter (where e.event_type='page_view') as raw_visits
from public.sites s
left join first_outreach o on o.site_id=s.id
left join public.concept_events e on e.site_id=s.id
left join qualified_sessions q on q.site_id=e.site_id and q.session_id=e.session_id
where s.status = any(array['concept'::text,'live'::text])
  and public.is_labnarrative_admin()
group by s.id,s.slug,s.status,s.outreach_status,s.content,o.first_outreach_at;
