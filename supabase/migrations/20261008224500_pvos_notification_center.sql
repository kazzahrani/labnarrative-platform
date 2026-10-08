-- PVOS notification center, independent of email-delivery status.
-- Read state is user-scoped; sourced from invoice handoffs and task reviews.
create table if not exists public.pvos_notification_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 notification_key text not null,
 read_at timestamptz not null default clock_timestamp(),
 primary key(user_id,notification_key),
 constraint pvos_notification_key_len check(length(notification_key) between 10 and 130)
);
alter table public.pvos_notification_reads enable row level security;
revoke all on public.pvos_notification_reads from public,anon,authenticated;

create or replace function public.pvos_notification_source()
returns table(
 notification_key text,kind text,title text,description text,target_path text,created_at timestamptz
) language sql stable security definer set search_path='' as $$
 select 'invoice:'||n.id::text, 'invoice'::text,
   case n.event_type
     when 'head_review' then 'Head approval requested'
     when 'finance_review' then 'Finance approval requested'
     when 'awaiting_payment' then 'Payment confirmation needed'
     when 'returned_head' then 'Invoice returned by Head'
     when 'returned_finance' then 'Invoice returned by Finance'
     when 'paid' then 'Payment completed'
     else 'Invoice updated'
   end,
   coalesce(i.invoice_ref,i.title)||' · '||c.name,
   '/pvos/invoices?invoice='||i.id::text,
   n.created_at
 from public.pvos_invoice_notifications n
 join public.pvos_invoice_processes i on i.id=n.invoice_id
 join public.pvos_companies c on c.id=i.company_id
 where auth.uid() is not null and n.recipient_user_id=auth.uid()
 union all
 select 'task-review:'||r.id::text, 'task'::text,'Task review requested',
   t.title||' · '||c.name,
   '/pvos/tasks/'||r.task_id::text,r.sent_at
 from public.pvos_task_reviews r
 join public.pvos_tasks t on t.id=r.task_id
 join public.pvos_companies c on c.id=r.company_id
 where auth.uid() is not null and r.assigned_to=auth.uid()
   and exists(select 1 from public.pvos_memberships m
      where m.organization_id=r.organization_id and m.user_id=auth.uid())
 union all
 select 'task-decision:'||r.id::text, 'task'::text,
   case r.status when 'approved' then 'Task review approved'
                 when 'returned' then 'Task review returned'
                 else 'Task review decided' end,
   t.title||' · '||c.name,
   '/pvos/tasks/'||r.task_id::text,r.decided_at
 from public.pvos_task_reviews r
 join public.pvos_tasks t on t.id=r.task_id
 join public.pvos_companies c on c.id=r.company_id
 where auth.uid() is not null and r.sent_by=auth.uid()
   and r.decided_at is not null
   and r.assigned_to<>r.sent_by
   and exists(select 1 from public.pvos_memberships m
      where m.organization_id=r.organization_id and m.user_id=auth.uid());
$$;
revoke all on function public.pvos_notification_source() from public,anon,authenticated;

create or replace function public.pvos_notification_feed(p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_feed jsonb; v_unread integer; v_total integer;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_limit < 1 or p_limit > 60 then raise exception 'Invalid notification limit';end if;
 select count(*)::int, count(*) filter(where r.read_at is null)::int into v_total,v_unread
 from public.pvos_notification_source() s
 left join public.pvos_notification_reads r on r.notification_key=s.notification_key and r.user_id=auth.uid();
 select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc),'[]'::jsonb)
 into v_feed from (
  select s.notification_key as id,s.kind,s.title,s.description,s.target_path,s.created_at,
    r.read_at,(r.read_at is null) as unread
  from public.pvos_notification_source() s
  left join public.pvos_notification_reads r on r.notification_key=s.notification_key and r.user_id=auth.uid()
  order by s.created_at desc,s.notification_key desc limit p_limit
 ) row;
 return jsonb_build_object('items',v_feed,'unread_count',v_unread,'total',v_total);
end $$;
revoke all on function public.pvos_notification_feed(integer) from public,anon;
grant execute on function public.pvos_notification_feed(integer) to authenticated;

create or replace function public.pvos_notification_mark_read(p_key text default null,p_all boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_all then
  insert into public.pvos_notification_reads(user_id,notification_key)
  select auth.uid(),s.notification_key from public.pvos_notification_source() s
  on conflict(user_id,notification_key) do nothing;
  get diagnostics v_changed=row_count;
  return v_changed;
 end if;
 if p_key is null or not exists(
   select 1 from public.pvos_notification_source() s where s.notification_key=p_key
 ) then
  raise exception 'Notification not available';
 end if;
 insert into public.pvos_notification_reads(user_id,notification_key)
 values(auth.uid(),p_key)
 on conflict(user_id,notification_key) do nothing;
 get diagnostics v_changed=row_count;
 return v_changed;
end $$;
revoke all on function public.pvos_notification_mark_read(text,boolean) from public,anon;
grant execute on function public.pvos_notification_mark_read(text,boolean) to authenticated;
