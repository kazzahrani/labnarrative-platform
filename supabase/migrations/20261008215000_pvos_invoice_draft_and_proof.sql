-- v0.0.4 refinements: require an invoice PDF before initiating the approval chain.
alter table public.pvos_invoice_processes drop constraint if exists pvos_invoice_processes_status_check;
alter table public.pvos_invoice_processes add constraint pvos_invoice_processes_status_check
 check(status in('draft','head_review','returned_head','finance_review','returned_finance','awaiting_payment','paid'));
alter table public.pvos_invoice_processes alter column status set default 'draft';
alter table public.pvos_invoice_files add column if not exists kind text not null default 'invoice'
 check(kind in('invoice','payment_proof'));
alter table public.pvos_invoice_notifications add column if not exists claimed_at timestamptz;
create or replace function public.pvos_invoice_authorized_file(p_path text,p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null
 and p_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+[.]pdf$'
 and exists (
   select 1 from public.pvos_invoice_processes i
   where i.id::text = split_part(p_path,'/',1)
    and (case when p_write then
       (i.requested_by=auth.uid() and i.status in ('draft','head_review','returned_head','returned_finance') and split_part(p_path,'/',2) not like 'proof-%')
       or (i.finance_user_id=auth.uid() and i.status='awaiting_payment' and split_part(p_path,'/',2) like 'proof-%')
     else auth.uid() in (i.requested_by,i.head_user_id,i.finance_user_id) end)
 );
$$;
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
 values(v_id,auth.uid(),'created',null,'draft','Invoice draft created, awaiting PDF');
 return jsonb_build_object('id',v_id,'status','draft');
end $$;
create or replace function public.pvos_invoice_act(p_invoice_id uuid,p_action text,p_note text default null,
 p_payment_reference text default null,p_payment_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.pvos_invoice_processes%rowtype;v_next text;v_target uuid;v_event text;v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into i from public.pvos_invoice_processes where id=p_invoice_id for update;
 if not found or auth.uid() not in(i.requested_by,i.head_user_id,i.finance_user_id) then raise exception 'Invoice unavailable';end if;
 if i.status='draft' and p_action='submit' and auth.uid()=i.requested_by then
  if not exists(select 1 from public.pvos_invoice_files f where f.invoice_id=i.id and f.kind='invoice') then
   raise exception 'Upload the invoice PDF before submitting for Head approval';end if;
  v_next:='head_review';v_target:=i.head_user_id;v_event:='head_review';
 elsif i.status='head_review' and p_action='head_approve' and auth.uid()=i.head_user_id then
  if not exists(select 1 from public.pvos_invoice_files f where f.invoice_id=i.id and f.kind='invoice' and
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
  if not exists(select 1 from public.pvos_invoice_files f where f.invoice_id=i.id and f.kind='invoice' and f.created_at>i.last_returned_at) then
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
create or replace function public.pvos_invoice_record_file(p_invoice_id uuid,p_path text,p_filename text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.pvos_invoice_processes%rowtype;v_id uuid;
begin
 select * into i from public.pvos_invoice_processes where id=p_invoice_id for update;
 if not found or auth.uid() is null or i.requested_by<>auth.uid() or i.status not in('draft','head_review','returned_head','returned_finance')
 then raise exception 'Only the requester may attach an invoice while it is awaiting review or correction';end if;
 if p_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+[.]pdf$' or split_part(p_path,'/',1)<>p_invoice_id::text then
 raise exception 'Invalid invoice file path';end if;
 if split_part(p_path,'/',2) like 'proof-%' then raise exception 'Invoice documents must not use the payment-proof prefix';end if;
 if not exists(select 1 from storage.objects where bucket_id='pvos-invoices' and name=p_path and owner_id=auth.uid()::text) then
  raise exception 'Uploaded PDF not found or owned by another user';end if;
 insert into public.pvos_invoice_files(invoice_id,storage_path,filename,uploaded_by)
 values(p_invoice_id,p_path,left(trim(p_filename),200),auth.uid()) returning id into v_id;
 insert into public.pvos_invoice_events(invoice_id,actor_user_id,action,previous_status,next_status,note)
 values(p_invoice_id,auth.uid(),'file_uploaded',i.status,i.status,left(trim(p_filename),200));
 return jsonb_build_object('id',v_id);
end $$;
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
 from (select f.id,f.storage_path,f.filename,f.kind,f.created_at,coalesce(u.email,'Unknown') as uploaded_by
  from public.pvos_invoice_files f left join auth.users u on u.id=f.uploaded_by
  where f.invoice_id=p_invoice_id)x;
 return i||jsonb_build_object('events',events,'files',files);
end $$;
create or replace function public.pvos_invoice_record_payment_proof(p_invoice_id uuid,p_path text,p_filename text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.pvos_invoice_processes%rowtype;v_id uuid;
begin
 select * into i from public.pvos_invoice_processes where id=p_invoice_id for update;
 if not found or auth.uid() is null or auth.uid()<>i.finance_user_id or i.status<>'awaiting_payment' then
   raise exception 'Finance may upload payment evidence only before confirming execution';end if;
 if p_path !~ '^[0-9a-f-]{36}/proof-[A-Za-z0-9._-]+[.]pdf$' or split_part(p_path,'/',1)<>p_invoice_id::text then
   raise exception 'Invalid payment evidence path';end if;
 if not exists(select 1 from storage.objects where bucket_id='pvos-invoices' and name=p_path and owner_id=auth.uid()::text) then
   raise exception 'Payment proof not found in private storage';end if;
 insert into public.pvos_invoice_files(invoice_id,storage_path,filename,uploaded_by,kind)
 values(p_invoice_id,p_path,left(trim(p_filename),200),auth.uid(),'payment_proof') returning id into v_id;
 insert into public.pvos_invoice_events(invoice_id,actor_user_id,action,previous_status,next_status,note)
 values(p_invoice_id,auth.uid(),'payment_proof_uploaded',i.status,i.status,left(trim(p_filename),200));
 return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.pvos_invoice_record_payment_proof(uuid,text,text) from public,anon;
grant execute on function public.pvos_invoice_record_payment_proof(uuid,text,text) to authenticated;
create or replace function public.pvos_invoice_mail_claim(p_invoice_id uuid default null,p_limit integer default 15)
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required';end if;
 if p_limit<1 or p_limit>30 then raise exception 'Invalid claim size';end if;
 with eligible as (
  select n.id from public.pvos_invoice_notifications n
  where (p_invoice_id is null or n.invoice_id=p_invoice_id)
   and ((n.status in ('queued','failed') and n.attempts<5)
     or (n.status='sending' and n.claimed_at<clock_timestamp()-interval '15 minutes'))
  order by n.created_at
  for update skip locked limit p_limit
 ), updated as (
  update public.pvos_invoice_notifications n set status='sending',claimed_at=clock_timestamp(),attempts=attempts+1,last_error=null
  from eligible e where n.id=e.id returning n.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'invoice_id',n.invoice_id,
   'recipient_email',n.recipient_email,'event_type',n.event_type,'company_name',c.name,
   'created_at',n.created_at)),'[]'::jsonb) into batch
 from updated n join public.pvos_invoice_processes i on i.id=n.invoice_id join public.pvos_companies c on c.id=i.company_id;
 return batch;
end $$;
