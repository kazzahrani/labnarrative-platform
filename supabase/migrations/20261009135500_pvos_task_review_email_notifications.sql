-- Task-review email queue. Reuses PVOS's existing iCloud SMTP transport.
-- Does not modify review decisions, evidence freezes, or the invoice workflow.
create table if not exists public.pvos_task_review_mail (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.pvos_task_reviews(id) on delete cascade,
 event_type text not null check(event_type in ('requested','approved','returned')),
 recipient_user_id uuid not null references auth.users(id),
 recipient_email text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed')),
 attempts integer not null default 0,
 claimed_at timestamptz,
 sent_at timestamptz,
 provider_message_id text,
 last_error text,
 created_at timestamptz not null default clock_timestamp(),
 constraint pvos_task_review_mail_unique unique(review_id,event_type)
);
create index if not exists pvos_task_review_mail_retry_idx
 on public.pvos_task_review_mail(status,created_at);
alter table public.pvos_task_review_mail enable row level security;
revoke all on public.pvos_task_review_mail from public,anon,authenticated;
grant select,insert,update on public.pvos_task_review_mail to service_role;

create or replace function public.pvos_task_review_mail_enqueue()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event text;v_user uuid;v_email text;
begin
 if tg_op='INSERT' then
  v_event:='requested';v_user:=new.assigned_to;v_email:=new.assigned_email;
 elsif tg_op='UPDATE' and old.status='pending' and new.status in ('approved','returned') then
  v_event:=new.status;v_user:=new.sent_by;v_email:=new.sent_by_email;
 else
  return new;
 end if;
 if v_email is not null and v_user is not null then
  insert into public.pvos_task_review_mail(review_id,event_type,recipient_user_id,recipient_email)
  values(new.id,v_event,v_user,v_email) on conflict(review_id,event_type) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists pvos_task_review_mail_enqueue on public.pvos_task_reviews;
create trigger pvos_task_review_mail_enqueue
 after insert or update of status on public.pvos_task_reviews
 for each row execute function public.pvos_task_review_mail_enqueue();

create or replace function public.pvos_task_review_mail_claim(p_review_id uuid default null,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required';end if;
 if p_limit<1 or p_limit>20 then raise exception 'Invalid batch size';end if;
 with eligible as (
  select n.id from public.pvos_task_review_mail n
  where (p_review_id is null or n.review_id=p_review_id)
    and ((n.status in ('queued','failed') and n.attempts<5)
      or (n.status='sending' and n.claimed_at<clock_timestamp()-interval '15 minutes'))
  order by n.created_at for update skip locked limit p_limit
 ), claimed as (
  update public.pvos_task_review_mail n set
    status='sending', attempts=n.attempts+1, claimed_at=clock_timestamp(), last_error=null
  from eligible e where n.id=e.id returning n.*
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',n.id,'review_id',n.review_id,'task_id',r.task_id,
  'recipient_email',n.recipient_email,'event_type',n.event_type,
  'company_name',c.name,'task_title',t.title,'sent_at',r.sent_at,
  'decision_at',r.decided_at
 )),'[]'::jsonb) into v_batch
 from claimed n
 join public.pvos_task_reviews r on r.id=n.review_id
 join public.pvos_tasks t on t.id=r.task_id
 join public.pvos_companies c on c.id=r.company_id;
 return v_batch;
end $$;

create or replace function public.pvos_task_review_mail_finish(
 p_notice_id uuid,p_success boolean,p_provider_id text default null,p_error text default null
) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required';end if;
 update public.pvos_task_review_mail set
  status=case when p_success then 'sent' else 'failed' end,
  sent_at=case when p_success then clock_timestamp() else sent_at end,
  provider_message_id=case when p_success then left(coalesce(p_provider_id,''),200) else null end,
  last_error=case when p_success then null else left(coalesce(p_error,'SMTP send failed'),500) end,
  claimed_at=null
 where id=p_notice_id and status='sending';
 if not found then raise exception 'Notification was not claimed';end if;
end $$;
revoke all on function public.pvos_task_review_mail_claim(uuid,integer),
 public.pvos_task_review_mail_finish(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.pvos_task_review_mail_claim(uuid,integer),
 public.pvos_task_review_mail_finish(uuid,boolean,text,text) to service_role;
revoke all on function public.pvos_task_review_mail_enqueue() from public,anon,authenticated;
