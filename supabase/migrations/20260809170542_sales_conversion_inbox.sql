create or replace function public.sales_conversion_inbox()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_labnarrative_admin() then
    jsonb_build_object('error','Administrator access required')
  else coalesce(jsonb_agg(to_jsonb(x) order by x.priority_rank desc, x.last_activity_at desc nulls last), '[]'::jsonb) end
  from (
    select
      p.id as prospect_id,
      p.pi_name,
      p.institution,
      p.email,
      p.qualification_score,
      p.status as prospect_status,
      s.id as site_id,
      s.slug,
      s.outreach_status,
      coalesce(w.stage, case when s.outreach_status in ('replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing') then s.outreach_status else 'contacted' end) as stage,
      w.next_action,
      w.next_action_due_at,
      w.meeting_at,
      w.proposal_status,
      w.payment_status,
      coalesce(r.human_replies,0) as human_replies,
      coalesce(r.automatic_replies,0) as automatic_replies,
      r.last_reply_at,
      coalesce(a.visits,0) as visits,
      coalesce(a.page_views,0) as page_views,
      greatest(coalesce(w.updated_at,'epoch'::timestamptz),coalesce(r.last_reply_at,'epoch'::timestamptz),coalesce(m.last_sent_at,'epoch'::timestamptz),coalesce(a.last_viewed_at,'epoch'::timestamptz)) as last_activity_at,
      case
        when coalesce(w.stage,s.outreach_status)='client' then 700
        when coalesce(w.stage,s.outreach_status)='proposal_sent' then 600
        when coalesce(w.stage,s.outreach_status)='meeting_scheduled' then 500
        when coalesce(w.stage,s.outreach_status)='interested' then 400
        when coalesce(r.human_replies,0)>0 or coalesce(w.stage,s.outreach_status)='replied' then 300
        when w.id is not null then 200
        else 100
      end as priority_rank
    from public.prospects p
    join public.sites s on s.id=p.site_id
    left join public.sales_lead_workspaces w on w.prospect_id=p.id
    left join lateral (
      select count(*) filter(where reply_kind='human')::int human_replies,
             count(*) filter(where reply_kind='automatic')::int automatic_replies,
             max(received_at) last_reply_at
      from public.outreach_replies rr where rr.prospect_id=p.id
    ) r on true
    left join lateral (
      select max(sent_at) last_sent_at from public.outreach_messages mm where mm.prospect_id=p.id and mm.status='sent' and coalesce(mm.is_test,false)=false
    ) m on true
    left join public.sales_concept_summary a on a.site_id=s.id
    where w.id is not null
       or s.outreach_status in ('replied','interested','meeting_scheduled','proposal_sent','client')
       or coalesce(r.human_replies,0)>0
       or m.last_sent_at is not null
    order by priority_rank desc, last_activity_at desc nulls last
    limit 60
  ) x;
$$;
revoke all on function public.sales_conversion_inbox() from public, anon;
grant execute on function public.sales_conversion_inbox() to authenticated;
