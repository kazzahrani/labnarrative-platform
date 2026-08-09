create table if not exists public.sales_action_completions (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  action_type text not null,
  title text not null,
  completed_at timestamptz not null default now(),
  completed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_action_completions_prospect_idx on public.sales_action_completions(prospect_id, completed_at desc);
create index if not exists sales_action_completions_completed_idx on public.sales_action_completions(completed_at desc);

alter table public.sales_action_completions enable row level security;
revoke all on public.sales_action_completions from public, anon, authenticated;
grant all on public.sales_action_completions to service_role;

create or replace function public.sales_daily_action_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if not public.is_labnarrative_admin() then
    raise exception 'Administrator access required';
  end if;

  with
  latest_human as (
    select distinct on (r.prospect_id)
      r.prospect_id, r.id as reply_id, r.received_at, r.subject, r.body_text
    from public.outreach_replies r
    where r.reply_kind = 'human'
    order by r.prospect_id, r.received_at desc
  ),
  latest_outbound as (
    select m.prospect_id,
           max(coalesce(m.sent_at,m.created_at)) filter (where m.status='sent') as last_sent_at,
           max(coalesce(m.sent_at,m.created_at)) filter (where m.message_kind='initial' and m.status='sent') as initial_sent_at
    from public.outreach_messages m
    where coalesce(m.is_test,false)=false and m.prospect_id is not null
    group by m.prospect_id
  ),
  base as (
    select p.id as prospect_id,p.pi_name,p.institution,p.qualification_score,
           s.id as site_id,s.slug,s.outreach_status,
           w.id as workspace_id,w.stage,w.next_action,w.next_action_due_at,w.meeting_at,w.proposal_status,w.proposal_sent_at,w.payment_status,w.deposit_received_at,w.updated_at as workspace_updated_at,
           sc.visits,sc.page_views,sc.last_viewed_at,
           li.status as linkedin_status,li.last_action_at as linkedin_last_action_at,
           lh.reply_id,lh.received_at as latest_reply_at,lh.subject as latest_reply_subject,
           lo.last_sent_at,lo.initial_sent_at
    from public.prospects p
    left join public.sites s on s.id=p.site_id
    left join public.sales_lead_workspaces w on w.prospect_id=p.id
    left join public.sales_concept_summary sc on sc.site_id=s.id
    left join public.linkedin_outreach li on li.prospect_id=p.id
    left join latest_human lh on lh.prospect_id=p.id
    left join latest_outbound lo on lo.prospect_id=p.id
    where p.status not in ('rejected','paused')
  ),
  raw_actions as (
    select 'reply:'||b.reply_id::text action_key,b.prospect_id,b.pi_name,b.institution,'reply_waiting' action_type,
           'Reply to '||b.pi_name title,
           coalesce(nullif(b.latest_reply_subject,''),'Human reply received') detail,
           b.latest_reply_at due_at,
           100 priority,b.slug,coalesce(b.stage,b.outreach_status,'contacted') stage,b.latest_reply_at source_at
    from base b
    where b.reply_id is not null and (b.last_sent_at is null or b.latest_reply_at > b.last_sent_at)

    union all
    select 'next:'||b.prospect_id::text||':'||md5(coalesce(b.next_action,'')||'|'||coalesce(b.next_action_due_at::text,'')),b.prospect_id,b.pi_name,b.institution,'manual_next_action',
           coalesce(nullif(b.next_action,''),'Complete next action'),
           'Manual next action from the lead workspace',b.next_action_due_at,92,b.slug,coalesce(b.stage,b.outreach_status,'contacted'),b.next_action_due_at
    from base b
    where nullif(trim(coalesce(b.next_action,'')),'') is not null and b.next_action_due_at is not null

    union all
    select 'interested:'||b.prospect_id::text,b.prospect_id,b.pi_name,b.institution,'interested_no_meeting',
           'Schedule a meeting with '||b.pi_name,
           'The PI is marked interested but no meeting is recorded.',now(),88,b.slug,coalesce(b.stage,b.outreach_status,'interested'),coalesce(b.workspace_updated_at,now())
    from base b
    where coalesce(b.stage,b.outreach_status)='interested' and b.meeting_at is null

    union all
    select 'meeting:'||b.prospect_id::text||':'||extract(epoch from b.meeting_at)::bigint::text,b.prospect_id,b.pi_name,b.institution,'meeting_approaching',
           'Prepare for meeting with '||b.pi_name,
           'Meeting scheduled for '||to_char(b.meeting_at at time zone 'Asia/Riyadh','DD Mon YYYY HH24:MI')||' Riyadh time.',b.meeting_at,86,b.slug,coalesce(b.stage,b.outreach_status,'meeting_scheduled'),b.meeting_at
    from base b
    where b.meeting_at is not null and b.meeting_at >= now() and b.meeting_at <= now()+interval '14 days' and coalesce(b.stage,'') not in ('client','not_pursuing')

    union all
    select 'postmeeting:'||b.prospect_id::text||':'||extract(epoch from b.meeting_at)::bigint::text,b.prospect_id,b.pi_name,b.institution,'post_meeting_followup',
           'Follow up after meeting with '||b.pi_name,
           'The meeting has passed and no sent/accepted proposal is recorded.',b.meeting_at+interval '2 hours',90,b.slug,coalesce(b.stage,b.outreach_status,'meeting_scheduled'),b.meeting_at
    from base b
    where b.meeting_at is not null and b.meeting_at < now()
      and coalesce(b.proposal_status,'not_started') not in ('sent','accepted')
      and coalesce(b.stage,'') not in ('client','not_pursuing')

    union all
    select 'proposal:'||b.prospect_id::text||':'||coalesce(extract(epoch from b.proposal_sent_at)::bigint::text,'unspecified'),b.prospect_id,b.pi_name,b.institution,'proposal_followup',
           'Follow up on proposal with '||b.pi_name,
           'Proposal is recorded as sent and is awaiting a decision.',coalesce(b.proposal_sent_at,b.workspace_updated_at,now())+interval '3 days',76,b.slug,coalesce(b.stage,b.outreach_status,'proposal_sent'),coalesce(b.proposal_sent_at,b.workspace_updated_at,now())
    from base b
    where coalesce(b.proposal_status,'')='sent' and coalesce(b.stage,'') not in ('client','not_pursuing')

    union all
    select 'deposit:'||b.prospect_id::text||':'||coalesce(extract(epoch from b.workspace_updated_at)::bigint::text,'0'),b.prospect_id,b.pi_name,b.institution,'deposit_followup',
           'Check deposit with '||b.pi_name,
           'Deposit has been requested but not recorded as received.',coalesce(b.workspace_updated_at,now())+interval '2 days',78,b.slug,coalesce(b.stage,b.outreach_status,'proposal_sent'),coalesce(b.workspace_updated_at,now())
    from base b
    where b.payment_status='deposit_requested' and b.deposit_received_at is null and coalesce(b.stage,'') not in ('not_pursuing')

    union all
    select 'engagement:'||b.prospect_id::text||':'||extract(epoch from b.last_viewed_at)::bigint::text,b.prospect_id,b.pi_name,b.institution,'high_engagement_silent',
           'Review engaged PI: '||b.pi_name,
           coalesce(b.visits,0)::text||' visits and '||coalesce(b.page_views,0)::text||' page views without a human reply.',now(),62,b.slug,coalesce(b.stage,b.outreach_status,'contacted'),b.last_viewed_at
    from base b
    where coalesce(b.visits,0)>=2 and b.last_viewed_at is not null and b.last_viewed_at >= now()-interval '7 days'
      and b.reply_id is null and coalesce(b.stage,b.outreach_status,'contacted') not in ('replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing')

    union all
    select 'delivery:'||m.id::text,p.id,p.pi_name,p.institution,'delivery_problem',
           'Fix delivery for '||p.pi_name,
           coalesce(nullif(m.error_message,''),'Email delivery problem: '||coalesce(m.delivery_status,'failed')),
           coalesce(m.bounced_at,m.complained_at,m.updated_at,m.created_at),96,s.slug,coalesce(w.stage,s.outreach_status,'contacted'),coalesce(m.bounced_at,m.complained_at,m.updated_at,m.created_at)
    from public.outreach_messages m
    join public.prospects p on p.id=m.prospect_id
    left join public.sites s on s.id=p.site_id
    left join public.sales_lead_workspaces w on w.prospect_id=p.id
    where coalesce(m.is_test,false)=false and m.created_at >= now()-interval '30 days'
      and (m.bounced_at is not null or m.complained_at is not null or m.delivery_status in ('bounced','complained','failed'))
  ),
  uncompleted as (
    select a.*
    from raw_actions a
    left join public.sales_action_completions c on c.action_key=a.action_key
    where c.id is null
  ),
  linkedin_uncompleted as (
    select ('linkedin:'||b.prospect_id::text) action_key,b.prospect_id,b.pi_name,b.institution,'linkedin_touch' action_type,
           'LinkedIn touch for '||b.pi_name title,
           'Email outreach is at least two days old and LinkedIn is still not contacted.' detail,
           b.initial_sent_at+interval '2 days' due_at,55 priority,b.slug,coalesce(b.stage,b.outreach_status,'contacted') stage,b.initial_sent_at source_at,
           row_number() over(order by b.initial_sent_at asc nulls last,b.qualification_score desc nulls last) rn
    from base b
    left join public.sales_action_completions c on c.action_key=('linkedin:'||b.prospect_id::text)
    where b.linkedin_status='not_contacted' and b.initial_sent_at is not null and b.initial_sent_at <= now()-interval '2 days'
      and b.reply_id is null and coalesce(b.stage,b.outreach_status,'contacted') not in ('replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing')
      and c.id is null
  ),
  all_actions as (
    select * from uncompleted
    union all
    select action_key,prospect_id,pi_name,institution,action_type,title,detail,due_at,priority,slug,stage,source_at from linkedin_uncompleted where rn<=10
  ),
  bucketed as (
    select a.*,
      case
        when (a.due_at at time zone 'Asia/Riyadh')::date < (now() at time zone 'Asia/Riyadh')::date then 'overdue'
        when (a.due_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date then 'today'
        else 'upcoming'
      end bucket
    from all_actions a
  )
  select jsonb_build_object(
    'actions',coalesce((select jsonb_agg(to_jsonb(x) order by case x.bucket when 'overdue' then 0 when 'today' then 1 else 2 end,x.priority desc,x.due_at asc nulls last) from bucketed x),'[]'::jsonb),
    'completed',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'action_key',c.action_key,'prospect_id',c.prospect_id,'pi_name',p.pi_name,'institution',p.institution,'action_type',c.action_type,'title',c.title,'completed_at',c.completed_at) order by c.completed_at desc) from public.sales_action_completions c join public.prospects p on p.id=c.prospect_id where c.completed_at >= now()-interval '30 days'),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.sales_daily_action_complete(p_action_key text,p_prospect_id uuid,p_action_type text,p_title text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  if p_action_key is null or length(trim(p_action_key))<3 then raise exception 'Invalid action key'; end if;
  if not exists(select 1 from public.prospects where id=p_prospect_id) then raise exception 'Prospect not found'; end if;

  insert into public.sales_action_completions(action_key,prospect_id,action_type,title,completed_at,completed_by)
  values(p_action_key,p_prospect_id,coalesce(nullif(trim(p_action_type),''),'manual'),left(coalesce(nullif(trim(p_title),''),'Sales action'),240),now(),auth.uid())
  on conflict(action_key) do update set completed_at=excluded.completed_at,completed_by=excluded.completed_by;

  if p_action_type='manual_next_action' then
    update public.sales_lead_workspaces set next_action='',next_action_due_at=null,updated_at=now(),updated_by=auth.uid() where prospect_id=p_prospect_id;
  end if;

  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(p_prospect_id,'sales_action_completed','sales_daily_queue',left(coalesce(nullif(trim(p_title),''),'Sales action completed'),500),jsonb_build_object('action_key',p_action_key,'action_type',p_action_type),auth.uid());

  return jsonb_build_object('ok',true,'action_key',p_action_key,'completed_at',now());
end;
$function$;

create or replace function public.sales_daily_action_schedule(p_action_key text,p_prospect_id uuid,p_action_type text,p_title text,p_next_action text,p_due_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_stage text;
  v_site_status text;
  v_prospect_status text;
begin
  if not public.is_labnarrative_admin() then raise exception 'Administrator access required'; end if;
  if nullif(trim(coalesce(p_next_action,'')),'') is null then raise exception 'Next action is required'; end if;
  if p_due_at is null then raise exception 'Due date is required'; end if;

  select s.outreach_status,p.status into v_site_status,v_prospect_status
  from public.prospects p left join public.sites s on s.id=p.site_id where p.id=p_prospect_id;
  if not found then raise exception 'Prospect not found'; end if;

  select stage into v_stage from public.sales_lead_workspaces where prospect_id=p_prospect_id;
  if v_stage is null then
    v_stage := case
      when v_site_status in ('replied','interested','meeting_scheduled','proposal_sent','client','not_pursuing') then v_site_status
      when v_prospect_status='interested' then 'interested'
      when v_prospect_status='replied' then 'replied'
      else 'contacted'
    end;
  end if;

  insert into public.sales_lead_workspaces(prospect_id,stage,next_action,next_action_due_at,updated_at,updated_by)
  values(p_prospect_id,v_stage,trim(p_next_action),p_due_at,now(),auth.uid())
  on conflict(prospect_id) do update set next_action=excluded.next_action,next_action_due_at=excluded.next_action_due_at,updated_at=now(),updated_by=auth.uid();

  insert into public.sales_action_completions(action_key,prospect_id,action_type,title,completed_at,completed_by)
  values(p_action_key,p_prospect_id,coalesce(nullif(trim(p_action_type),''),'manual'),left(coalesce(nullif(trim(p_title),''),'Sales action'),240),now(),auth.uid())
  on conflict(action_key) do update set completed_at=excluded.completed_at,completed_by=excluded.completed_by;

  insert into public.pipeline_events(prospect_id,event_type,step,message,payload,created_by)
  values(p_prospect_id,'sales_action_scheduled','sales_daily_queue','Next sales action scheduled',jsonb_build_object('completed_action_key',p_action_key,'next_action',trim(p_next_action),'due_at',p_due_at),auth.uid());

  return jsonb_build_object('ok',true,'next_action',trim(p_next_action),'due_at',p_due_at);
end;
$function$;

revoke all on function public.sales_daily_action_queue() from public,anon;
revoke all on function public.sales_daily_action_complete(text,uuid,text,text) from public,anon;
revoke all on function public.sales_daily_action_schedule(text,uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.sales_daily_action_queue() to authenticated,service_role;
grant execute on function public.sales_daily_action_complete(text,uuid,text,text) to authenticated,service_role;
grant execute on function public.sales_daily_action_schedule(text,uuid,text,text,text,timestamptz) to authenticated,service_role;
