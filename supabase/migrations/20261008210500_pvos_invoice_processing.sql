
-- Invoice-only workflow. Approvers are authenticated users, NOT PVOS organization members.
-- Tables are completely inaccessible via Data API. All access is mediated by narrow RPCs.
create table if not exists public.pvos_invoice_processes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
 company_id uuid not null references public.pvos_companies(id) on delete cascade,
 requested_by uuid not null references auth.users(id),
 head_user_id uuid not null references auth.users(id),
 finance_user_id uuid not null references auth.users(id),
 title text not null check (length(trim(title)) between 4 and 300),
 invoice_ref text,
 description text not null check (length(trim(description)) >= 4),
 amount numeric(14,2),
 currency text not null default 'SAR',
 due_on date,
 status text not null default 'head_review'
   check(status in ('head_review','returned_head','finance_review','returned_finance','awaiting_payment','paid')),
 payment_reference text,
 payment_date date,
 payment_note text,
 last_returned_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(head_user_id<>requested_by and finance_user_id<>requested_by and head_user_id<>finance_user_id),
 check(amount is null or amount >= 0)
);
create index if not exists pvos_invoice_by_owner on public.pvos_invoice_processes(requested_by,created_at desc);
create index if not exists pvos_invoice_by_head on public.pvos_invoice_processes(head_user_id,status);
create index if not exists pvos_invoice_by_finance on public.pvos_invoice_processes(finance_user_id,status);
create table if not exists public.pvos_invoice_events (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.pvos_invoice_processes(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id),
 action text not null,
 previous_status text,
 next_status text,
 note text,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists pvos_invoice_event_lookup on public.pvos_invoice_events(invoice_id,created_at desc);
create table if not exists public.pvos_invoice_files (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.pvos_invoice_processes(id) on delete cascade,
 storage_path text not null unique,
 filename text not null,
 uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 check(length(filename) between 1 and 200)
);
create index if not exists pvos_invoice_file_lookup on public.pvos_invoice_files(invoice_id,created_at desc);
create table if not exists public.pvos_invoice_notifications (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.pvos_invoice_processes(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id),
 recipient_email text not null,
 event_type text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed')),
 attempts integer not null default 0,
 last_error text,
 provider_message_id text,
 created_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz
);
create index if not exists pvos_invoice_notice_queue on public.pvos_invoice_notifications(status,created_at) where status in ('queued','failed');

alter table public.pvos_invoice_processes enable row level security;
alter table public.pvos_invoice_events enable row level security;
alter table public.pvos_invoice_files enable row level security;
alter table public.pvos_invoice_notifications enable row level security;
revoke all on public.pvos_invoice_processes,public.pvos_invoice_events,public.pvos_invoice_files,public.pvos_invoice_notifications from public,anon,authenticated;

-- Private file bucket: signed downloads only for the three participants in that invoice.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pvos-invoices','pvos-invoices',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['application/pdf'];

create or replace function public.pvos_invoice_authorized_file(p_path text,p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null
 and p_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+[.]pdf$'
 and exists (
   select 1 from public.pvos_invoice_processes i
   where i.id::text = split_part(p_path,'/',1)
    and (case when p_write then
       i.requested_by=auth.uid() and i.status in ('head_review','returned_head','returned_finance')
     else auth.uid() in (i.requested_by,i.head_user_id,i.finance_user_id) end)
 );
$$;
revoke all on function public.pvos_invoice_authorized_file(text,boolean) from public,anon;
grant execute on function public.pvos_invoice_authorized_file(text,boolean) to authenticated;
drop policy if exists "PVOS invoice participant download" on storage.objects;
create policy "PVOS invoice participant download" on storage.objects for select to authenticated
 using (bucket_id='pvos-invoices' and public.pvos_invoice_authorized_file(name,false));
drop policy if exists "PVOS requester uploads invoice PDFs" on storage.objects;
create policy "PVOS requester uploads invoice PDFs" on storage.objects for insert to authenticated
 with check(bucket_id='pvos-invoices' and public.pvos_invoice_authorized_file(name,true));
-- Deliberately no UPDATE or DELETE. New file = new immutable version.

create or replace function public.pvos_invoice_queue_notice(p_invoice_id uuid,p_user_id uuid,p_event text)
returns void language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
 select email into v_email from auth.users where id=p_user_id;
 if v_email is null then raise exception 'Notification recipient not found'; end if;
 insert into public.pvos_invoice_notifications(invoice_id,recipient_user_id,recipient_email,event_type)
 values(p_invoice_id,p_user_id,v_email,p_event);
end $$;
revoke all on function public.pvos_invoice_queue_notice(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.pvos_invoice_create(
 p_company_id uuid,p_title text,p_description text,p_reference text,
 p_head_email text,p_finance_email text,p_amount numeric default null,
 p_currency text default 'SAR',p_due_on date default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pvos_companies%rowtype; h uuid;f uuid;v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to start invoice processing'; end if;
 select * into c from public.pvos_companies where id=p_company_id;
 if not found or not public.pvos_is_member(c.organization_id) then raise exception 'Company is not available'; end if;
 if length(trim(coalesce(p_title,'')))<4 or length(trim(coalesce(p_description,'')))<4 then
   raise exception 'Enter a meaningful title and description'; end if;
 if p_amount is not null and (p_amount<0 or p_amount>999999999999.99) then raise exception 'Invalid invoice amount';end if;
 if upper(coalesce(p_currency,'')) not in ('SAR','USD','EUR','AED','GBP') then raise exception 'Unsupported currency';end if;
 select id into h from auth.users where lower(email)=lower(trim(coalesce(p_head_email,'')));
 select id into f from auth.users where lower(email)=lower(trim(coalesce(p_finance_email,'')));
 if h is null or f is null then raise exception 'Both approvers must sign up for PVOS first. Check the exact email addresses.'; end if;
 if h=f or h=auth.uid() or f=auth.uid() then raise exception 'Choose two different approvers, neither of whom is the requester';end if;
 insert into public.pvos_invoice_processes(organization_id,company_id,requested_by,head_user_id,finance_user_id,title,description,invoice_ref,amount,currency,due_on)
 values(c.organization_id,c.id,auth.uid(),h,f,trim(p_title),trim(p_description),
  nullif(trim(coalesce(p_reference,'')),''),p_amount,upper(p_currency),p_due_on) returning id into v_id;
 insert into public.pvos_invoice_events(invoice_id,actor_user_id,action,previous_status,next_status,note)
 values(v_id,auth.uid(),'created',null,'head_review','Invoice submitted for department head review');
 perform public.pvos_invoice_queue_notice(v_id,h,'head_review');
 return jsonb_build_object('id',v_id,'status','head_review');
end $$;

create or replace function public.pvos_invoice_list()
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from (
 select i.id,i.company_id,c.name as company_name,i.title,i.invoice_ref,i.description,i.amount,i.currency,
 i.status,i.due_on,i.created_at,i.updated_at,i.payment_reference,i.payment_date,i.completed_at,
 i.requested_by,i.head_user_id,i.finance_user_id,
 requester.email as requester_email,head.email as head_email,finance.email as finance_email,
 (select count(*) from public.pvos_invoice_files d where d.invoice_id=i.id) as file_count
 from public.pvos_invoice_processes i
 join public.pvos_companies c on c.id=i.company_id
 join auth.users requester on requester.id=i.requested_by
 join auth.users head on head.id=i.head_user_id
 join auth.users finance on finance.id=i.finance_user_id
 where auth.uid() is not null and auth.uid() in (i.requested_by,i.head_user_id,i.finance_user_id)
)q;
$$;

create or replace function public.pvos_invoice_detail(p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i jsonb; events jsonb; files jsonb;
begin
 select to_jsonb(x) into i from (
  select i.id,i.company_id,c.name as company_name,i.title,i.invoice_ref,i.description,i.amount,i.currency,
    i.status,i.due_on,i.created_at,i.updated_at,i.completed_at,
    i.payment_reference,i.payment_date,i.payment_note,i.last_returned_at,
    i.requested_by,i.head_user_id,i.finance_user_id,
    rq.email as requester_email,hd.email as head_email,fn.email as finance_email
  from public.pvos_invoice_processes i
  join public.pvos_companies c on c.id=i.company_id
  join auth.users rq on rq.id=i.requested_by join auth.users hd on hd.id=i.head_user_id join auth.users fn on fn.id=i.finance_user_id
  where i.id=p_invoice_id and auth.uid() is not null and auth.uid() in(i.requested_by,i.head_user_id,i.finance_user_id)
 )x;
 if i is null then raise exception 'Invoice unavailable'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into events
 from (
  select e.action,e.previous_status,e.next_status,e.note,e.created_at,coalesce(u.email,'Unknown') as actor_email
  from public.pvos_invoice_events e left join auth.users u on u.id=e.actor_user_id
  where e.invoice_id=p_invoice_id
 )x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into files
 from (select f.id,f.storage_path,f.filename,f.created_at,coalesce(u.email,'Unknown') as uploaded_by
  from public.pvos_invoice_files f left join auth.users u on u.id=f.uploaded_by
  where f.invoice_id=p_invoice_id)x;
 return i||jsonb_build_object('events',events,'files',files);
end $$;

create or replace function public.pvos_invoice_record_file(p_invoice_id uuid,p_path text,p_filename text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.pvos_invoice_processes%rowtype;v_id uuid;
begin
 select * into i from public.pvos_invoice_processes where id=p_invoice_id for update;
 if not found or auth.uid() is null or i.requested_by<>auth.uid() or i.status not in('head_review','returned_head','returned_finance')
 then raise exception 'Only the requester may attach an invoice while it is awaiting review or correction';end if;
 if p_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+[.]pdf$' or split_part(p_path,'/',1)<>p_invoice_id::text then
 raise exception 'Invalid invoice file path';end if;
 if not exists(select 1 from storage.objects where bucket_id='pvos-invoices' and name=p_path and owner_id=auth.uid()::text) then
  raise exception 'Uploaded PDF not found or owned by another user';end if;
 insert into public.pvos_invoice_files(invoice_id,storage_path,filename,uploaded_by)
 values(p_invoice_id,p_path,left(trim(p_filename),200),auth.uid()) returning id into v_id;
 insert into public.pvos_invoice_events(invoice_id,actor_user_id,action,previous_status,next_status,note)
 values(p_invoice_id,auth.uid(),'file_uploaded',i.status,i.status,left(trim(p_filename),200));
 return jsonb_build_object('id',v_id);
end $$;

create or replace function public.pvos_invoice_act(p_invoice_id uuid,p_action text,p_note text default null,
 p_payment_reference text default null,p_payment_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.pvos_invoice_processes%rowtype;v_next text;v_target uuid;v_event text;v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into i from public.pvos_invoice_processes where id=p_invoice_id for update;
 if not found or auth.uid() not in(i.requested_by,i.head_user_id,i.finance_user_id) then raise exception 'Invoice unavailable';end if;
 if i.status='head_review' and p_action='head_approve' and auth.uid()=i.head_user_id then
  if not exists(select 1 from public.pvos_invoice_files f where f.invoice_id=i.id and
    (i.last_returned_at is null or f.created_at>i.last_returned_at)) then
    raise exception 'Upload the invoice PDF, or a revised PDF after the latest rejection, before approval';end if;
  v_next:='finance_review';v_target:=i.finance_user_id;v_event:='finance_review';
 elsif i.status='head_review' and p_action='head_return' and auth.uid()=i.head_user_id then
  if length(coalesce(v_note,''))<4 then raise exception 'A correction reason is required';end if;
  v_next:='returned_head';v_target:=i.requested_by;v_event:='returned_head';
 elsif i.status='finance_review' and p_action='finance_approve' and auth.uid()=i.finance_user_id then
  v_next:='awaiting_payment';v_target:=i.finance_user_id;v_event:='awaiting_payment';
 elsif i.status='finance_review' and p_action='finance_return' and auth.uid()=i.finance_user_id then
  if length(coalesce(v_note,''))<4 then raise exception 'A return reason is required';end if;
  v_next:='returned_finance';v_target:=i.requested_by;v_event:='returned_finance';
 elsif i.status in ('returned_head','returned_finance') and p_action='resubmit' and auth.uid()=i.requested_by then
  if not exists(select 1 from public.pvos_invoice_files f where f.invoice_id=i.id and f.created_at>i.last_returned_at) then
   raise exception 'Attach a corrected invoice version before resubmitting';end if;
  v_next:='head_review';v_target:=i.head_user_id;v_event:='head_review';
 elsif i.status='awaiting_payment' and p_action='confirm_paid' and auth.uid()=i.finance_user_id then
  if length(trim(coalesce(p_payment_reference,'')))<3 then raise exception 'Payment execution reference required';end if;
  if p_payment_date is null or p_payment_date>current_date then raise exception 'Enter a valid actual payment date';end if;
  v_next:='paid';v_target:=i.requested_by;v_event:='paid';
 else raise exception 'Action not permitted for this user or stage';end if;
 update public.pvos_invoice_processes set status=v_next,updated_at=clock_timestamp(),
 last_returned_at=case when v_next in ('returned_head','returned_finance') then clock_timestamp() else last_returned_at end,
 payment_reference=case when v_next='paid' then trim(p_payment_reference) else payment_reference end,
 payment_date=case when v_next='paid' then p_payment_date else payment_date end,
 payment_note=case when v_next='paid' then v_note else payment_note end,
 completed_at=case when v_next='paid' then clock_timestamp() else completed_at end
 where id=i.id;
 insert into public.pvos_invoice_events(invoice_id,actor_user_id,action,previous_status,next_status,note)
 values(i.id,auth.uid(),p_action,i.status,v_next,v_note);
 perform public.pvos_invoice_queue_notice(i.id,v_target,v_event);
 return jsonb_build_object('status',v_next,'id',i.id);
end $$;

-- In-app inbox count: only the recipient sees their own queued notifications.
create or replace function public.pvos_invoice_inbox_notifications()
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'invoice_id',n.invoice_id,
 'event_type',n.event_type,'created_at',n.created_at,'delivery_status',n.status) order by n.created_at desc),'[]'::jsonb)
from public.pvos_invoice_notifications n
where auth.uid() is not null and n.recipient_user_id=auth.uid();
$$;
revoke all on function public.pvos_invoice_create(uuid,text,text,text,text,text,numeric,text,date),
 public.pvos_invoice_list(),public.pvos_invoice_detail(uuid),public.pvos_invoice_record_file(uuid,text,text),
 public.pvos_invoice_act(uuid,text,text,text,date),public.pvos_invoice_inbox_notifications() from public,anon;
grant execute on function public.pvos_invoice_create(uuid,text,text,text,text,text,numeric,text,date),
 public.pvos_invoice_list(),public.pvos_invoice_detail(uuid),public.pvos_invoice_record_file(uuid,text,text),
 public.pvos_invoice_act(uuid,text,text,text,date),public.pvos_invoice_inbox_notifications() to authenticated;
