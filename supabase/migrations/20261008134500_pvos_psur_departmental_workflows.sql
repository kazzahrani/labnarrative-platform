
-- PVOS EURD-linked PSUR cycles and departmental collection.
-- Clinical/regulatory guard: EURD is an EU reference, never an automatic SFDA obligation.
create table if not exists public.pvos_psur_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
  company_id uuid not null references public.pvos_companies(id) on delete cascade,
  product_id uuid not null references public.pvos_products(id) on delete cascade,
  active_substance text not null,
  data_lock_point date not null,
  submission_due_date date not null,
  frequency_months integer check(frequency_months is null or frequency_months in (1,3,6,12,24,36,48,60)),
  jurisdiction text not null default 'reference_only' check(jurisdiction in ('eu','sfda','reference_only')),
  authority_basis text,
  source_url text not null default 'https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/periodic-safety-update-reports-psurs',
  source_revision text not null,
  source_published_at date,
  source_row jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check(status in ('draft','confirmed','superseded')),
  task_id uuid unique references public.pvos_tasks(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pvos_psur_due_after_dlp check(submission_due_date>=data_lock_point),
  constraint pvos_psur_source_nonempty check(length(trim(source_revision))>0),
  unique(product_id,data_lock_point,jurisdiction)
);
create index if not exists pvos_psur_company_due_idx on public.pvos_psur_cycles(company_id,submission_due_date);
create index if not exists pvos_psur_product_status_idx on public.pvos_psur_cycles(product_id,status);
alter table public.pvos_psur_cycles enable row level security;
revoke all on public.pvos_psur_cycles from anon,authenticated;
grant select,insert,update on public.pvos_psur_cycles to authenticated;
create policy pvos_psur_select on public.pvos_psur_cycles for select to authenticated
 using(public.pvos_is_member(organization_id));
create policy pvos_psur_insert on public.pvos_psur_cycles for insert to authenticated
 with check (
  status='draft' and task_id is null and confirmed_by is null and confirmed_at is null
  and created_by=auth.uid() and public.pvos_is_member(organization_id)
  and exists(select 1 from public.pvos_products p join public.pvos_companies c on c.id=p.company_id
   where p.id=product_id and c.id=company_id and c.organization_id=organization_id)
 );
create policy pvos_psur_update_draft on public.pvos_psur_cycles for update to authenticated
 using(status='draft' and created_by=auth.uid() and public.pvos_is_member(organization_id))
 with check(status='draft' and task_id is null and confirmed_by is null and confirmed_at is null
  and created_by=auth.uid() and public.pvos_is_member(organization_id));
create trigger pvos_psur_touch before update on public.pvos_psur_cycles
 for each row execute function public.pvos_touch_updated_at();

-- Immutable identity/review history: ordinary clients cannot modify confirmed cycles.
create or replace function public.pvos_psur_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') then
   if old.status<>'draft' then raise exception 'Confirmed PSUR cycles are immutable'; end if;
   if new.organization_id<>old.organization_id or new.company_id<>old.company_id or new.product_id<>old.product_id
      or new.created_by<>old.created_by or new.status<>'draft' then
       raise exception 'A PSUR draft cannot be reassigned or self-confirmed';
   end if;
 end if;
 return new;
end $$;
create trigger pvos_psur_guard before update on public.pvos_psur_cycles
 for each row execute function public.pvos_psur_guard();

create or replace function public.pvos_confirm_psur_cycle(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.pvos_psur_cycles%rowtype; v_task uuid; v_role text; v_company public.pvos_companies%rowtype; v_product public.pvos_products%rowtype; v_next_dlp date; v_next_due date;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v from public.pvos_psur_cycles where id=p_cycle_id for update;
 if not found or not public.pvos_is_member(v.organization_id) then raise exception 'PSUR cycle unavailable'; end if;
 select role into v_role from public.pvos_memberships where organization_id=v.organization_id and user_id=auth.uid();
 if v_role not in ('admin','qppv','deputy_qppv','manager') then raise exception 'A PV lead must confirm the regulatory basis'; end if;
 if v.status='confirmed' then return jsonb_build_object('task_id',v.task_id,'already_confirmed',true); end if;
 if v.status<>'draft' then raise exception 'Cycle cannot be confirmed'; end if;
 if v.jurisdiction='reference_only' or length(trim(coalesce(v.authority_basis,'')))<8 then
  raise exception 'Record an applicable EU requirement or verified local authority basis before confirmation';
 end if;
 select * into v_company from public.pvos_companies where id=v.company_id and organization_id=v.organization_id;
 select * into v_product from public.pvos_products where id=v.product_id and company_id=v.company_id;
 if v_company.id is null or v_product.id is null then raise exception 'Product/company linkage invalid'; end if;
 if exists(select 1 from public.pvos_psur_cycles x where x.id<>v.id and x.product_id=v.product_id and x.jurisdiction=v.jurisdiction and x.data_lock_point=v.data_lock_point and x.status='confirmed') then
  raise exception 'This product and DLP already have a confirmed deadline';
 end if;
 insert into public.pvos_tasks(
   organization_id,company_id,product_id,title,activity_type,source,status,priority,owner_user_id,reviewer_user_id,due_at,notes,metadata
 ) values(
   v.organization_id,v.company_id,v.product_id,
   'PSUR/PBRER · '||v_product.brand_name||' · DLP '||v.data_lock_point::text,
   'PSUR/PBRER','system','not_started','high',
   coalesce(v_company.qppv_user_id,auth.uid()),v_company.deputy_user_id,
   ((v.submission_due_date+1)::timestamp at time zone 'Asia/Riyadh')-interval '1 second',
   'Regulatory deadline confirmed by PV lead. Attach report, submission evidence and authority acknowledgement to this task.',
   jsonb_build_object('psur_cycle_id',v.id,'data_lock_point',v.data_lock_point,
    'submission_due_date',v.submission_due_date,'source_revision',v.source_revision,
    'source_url',v.source_url,'authority_basis',v.authority_basis,'jurisdiction',v.jurisdiction)
 ) returning id into v_task;
 update public.pvos_psur_cycles set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),task_id=v_task where id=v.id;
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,after_data)
 values(v.organization_id,v.company_id,auth.uid(),'psur_cycle',v.id,'confirmed',
  jsonb_build_object('task_id',v_task,'jurisdiction',v.jurisdiction,'source_revision',v.source_revision,'deadline',v.submission_due_date));
 -- Forecast ONLY a draft; this is not a verified EURD deadline and creates no task.
 if v.frequency_months is not null then
   v_next_dlp := (v.data_lock_point + make_interval(months=>v.frequency_months))::date;
   v_next_due := v_next_dlp + (v.submission_due_date-v.data_lock_point);
   insert into public.pvos_psur_cycles(
     organization_id,company_id,product_id,active_substance,data_lock_point,submission_due_date,
     frequency_months,jurisdiction,authority_basis,source_url,source_revision,source_published_at,source_row,created_by
   ) values(
     v.organization_id,v.company_id,v.product_id,v.active_substance,v_next_dlp,v_next_due,
     v.frequency_months,'reference_only',null,v.source_url,'PROJECTION - verify against a current EURD revision',
     null,jsonb_build_object('forecast_from',v.id,'not_regulatory_deadline',true),auth.uid()
   ) on conflict(product_id,data_lock_point,jurisdiction) do nothing;
 end if;
 return jsonb_build_object('task_id',v_task,'already_confirmed',false);
end $$;
revoke all on function public.pvos_confirm_psur_cycle(uuid) from public,anon;
grant execute on function public.pvos_confirm_psur_cycle(uuid) to authenticated;

create table if not exists public.pvos_department_requests(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.pvos_organizations(id) on delete cascade,
 company_id uuid not null references public.pvos_companies(id) on delete cascade,
 product_id uuid references public.pvos_products(id) on delete set null,
 task_id uuid not null unique references public.pvos_tasks(id) on delete restrict,
 request_type text not null check(request_type in ('invoice','regulatory_history','safety_data','labelling','document','other')),
 department text not null check(length(trim(department))>0),
 recipient_user_id uuid references auth.users(id),
 recipient_email text,
 requester_user_id uuid not null references auth.users(id),
 reviewer_user_id uuid not null references auth.users(id),
 details text not null check(length(trim(details))>3),
 external_reference text,
 status text not null default 'draft' check(status in ('draft','waiting','received','returned','complete','cancelled')),
 response_note text,
 decision_note text,
 followup_count integer not null default 0,
 last_followup_at timestamptz,
 due_at timestamptz not null,
 requested_at timestamptz,
 received_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(requester_user_id<>reviewer_user_id)
);
create index if not exists pvos_department_due_idx on public.pvos_department_requests(organization_id,status,due_at);
create index if not exists pvos_department_assignee_idx on public.pvos_department_requests(organization_id,recipient_user_id,status);
alter table public.pvos_department_requests enable row level security;
revoke all on public.pvos_department_requests from public,anon,authenticated;
grant select on public.pvos_department_requests to authenticated;
create policy pvos_department_read on public.pvos_department_requests for select to authenticated
 using(public.pvos_is_member(organization_id));
create trigger pvos_department_touch before update on public.pvos_department_requests
 for each row execute function public.pvos_touch_updated_at();

create or replace function public.pvos_new_department_request(
 p_company_id uuid,p_product_id uuid,p_request_type text,p_department text,
 p_recipient_user_id uuid,p_recipient_email text,p_reviewer_user_id uuid,
 p_details text,p_reference text,p_due_date date
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pvos_companies%rowtype; v_task uuid; v_id uuid; v_title text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into c from public.pvos_companies where id=p_company_id;
 if not found or not public.pvos_is_member(c.organization_id) then raise exception 'Company not accessible'; end if;
 if p_product_id is not null and not exists(select 1 from public.pvos_products where id=p_product_id and company_id=c.id) then raise exception 'Product is not in this company'; end if;
 if p_reviewer_user_id is null or p_reviewer_user_id=auth.uid() or not exists(
  select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_reviewer_user_id
 ) then raise exception 'Choose another workspace member as reviewer'; end if;
 if p_recipient_user_id is not null and not exists(
  select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_recipient_user_id
 ) then raise exception 'Recipient is not a workspace member'; end if;
 if p_due_date is null then raise exception 'Due date required'; end if;
 if p_request_type not in ('invoice','regulatory_history','safety_data','labelling','document','other') or length(trim(coalesce(p_department,'')))=0 or length(trim(coalesce(p_details,'')))<4 then
  raise exception 'Specify request type, department and required information'; end if;
 v_title := (case when p_request_type='invoice' then 'Invoice' else 'Department request' end)||' · '||trim(p_department);
 insert into public.pvos_tasks(
   organization_id,company_id,product_id,title,activity_type,source,status,priority,
   owner_user_id,reviewer_user_id,due_at,notes,metadata
 ) values(
   c.organization_id,c.id,p_product_id,v_title,
   case when p_request_type='invoice' then 'Invoice' else 'Department request' end,
   'system','not_started','medium',auth.uid(),p_reviewer_user_id,
   ((p_due_date+1)::timestamp at time zone 'Asia/Riyadh')-interval '1 second',
   p_details,jsonb_build_object('department',trim(p_department),'request_type',p_request_type)
 ) returning id into v_task;
 insert into public.pvos_department_requests(
  organization_id,company_id,product_id,task_id,request_type,department,recipient_user_id,
  recipient_email,requester_user_id,reviewer_user_id,details,external_reference,due_at
 ) values (
  c.organization_id,c.id,p_product_id,v_task,p_request_type,trim(p_department),p_recipient_user_id,
  nullif(trim(coalesce(p_recipient_email,'')),''),auth.uid(),p_reviewer_user_id,trim(p_details),
  nullif(trim(coalesce(p_reference,'')),''),((p_due_date+1)::timestamp at time zone 'Asia/Riyadh')-interval '1 second'
 ) returning id into v_id;
 update public.pvos_tasks set metadata=metadata||jsonb_build_object('department_request_id',v_id) where id=v_task;
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,after_data)
 values(c.organization_id,c.id,auth.uid(),'department_request',v_id,'created',
  jsonb_build_object('task_id',v_task,'department',p_department,'request_type',p_request_type));
 return jsonb_build_object('request_id',v_id,'task_id',v_task);
end $$;
revoke all on function public.pvos_new_department_request(uuid,uuid,text,text,uuid,text,uuid,text,text,date) from public,anon;
grant execute on function public.pvos_new_department_request(uuid,uuid,text,text,uuid,text,uuid,text,text,date) to authenticated;

create or replace function public.pvos_act_department_request(p_request_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_department_requests%rowtype; next_status text; v_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.pvos_department_requests where id=p_request_id for update;
 if not found or not public.pvos_is_member(r.organization_id) then raise exception 'Request unavailable'; end if;
 select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
 if p_action='follow_up' then
   if r.status<>'waiting' then raise exception 'Only waiting requests can be chased'; end if;
   if auth.uid()<>r.requester_user_id and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only requester or PV lead can follow up'; end if;
   update public.pvos_department_requests set followup_count=followup_count+1,last_followup_at=now() where id=r.id;
   insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,metadata)
   values(r.organization_id,r.company_id,auth.uid(),'department_request',r.id,'follow_up',
    jsonb_build_object('note',coalesce(p_note,''),'method','manual_record'));
   return jsonb_build_object('status',r.status);
 end if;
 if (r.status='draft' and p_action='mark_requested') then next_status:='waiting';
 elsif (r.status='waiting' and p_action='mark_received') then next_status:='received';
 elsif (r.status='received' and p_action='return') then next_status:='returned';
 elsif (r.status='returned' and p_action='resend') then next_status:='waiting';
 elsif (r.status='received' and p_action='approve') then next_status:='complete';
 elsif (r.status in ('draft','waiting') and p_action='cancel') then next_status:='cancelled';
 else raise exception 'Invalid workflow transition'; end if;
 if p_action='mark_received' and auth.uid()<>r.requester_user_id
    and (r.recipient_user_id is null or auth.uid()<>r.recipient_user_id)
    and auth.uid()<>r.reviewer_user_id and v_role not in ('admin','qppv','deputy_qppv') then
     raise exception 'Not authorised to log receipt'; end if;
 if p_action in ('mark_requested','resend','cancel') and auth.uid()<>r.requester_user_id
    and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only requester or PV lead may change the request'; end if;
 if p_action in ('approve','return') and auth.uid()<>r.reviewer_user_id then raise exception 'Only the assigned reviewer may decide'; end if;
 if p_action in ('mark_received','return') and length(trim(coalesce(p_note,'')))<4 then raise exception 'Provide a receipt/return note'; end if;
 if p_action='approve' and not exists(select 1 from public.pvos_task_evidence where task_id=r.task_id and archived_at is null) then
  raise exception 'Attach received evidence on the linked task before approval'; end if;
 update public.pvos_department_requests set status=next_status,
  requested_at=case when p_action='mark_requested' then now() else requested_at end,
  received_at=case when p_action='mark_received' then now() else received_at end,
  completed_at=case when p_action='approve' then now() else completed_at end,
  response_note=case when p_action='mark_received' then p_note else response_note end,
  decision_note=case when p_action in ('return','approve') then p_note else decision_note end
 where id=r.id;
 update public.pvos_tasks set status=case next_status
   when 'waiting' then 'awaiting_external' when 'received' then 'in_progress'
   when 'returned' then 'in_progress' when 'complete' then 'complete'
   when 'cancelled' then 'cancelled' else 'not_started' end,
  completed_at=case when next_status='complete' then now() else null end
 where id=r.task_id;
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata)
 values(r.organization_id,r.company_id,auth.uid(),'department_request',r.id,p_action,
  jsonb_build_object('status',r.status),
  jsonb_build_object('status',next_status),
  jsonb_build_object('note',coalesce(p_note,''),'task_id',r.task_id));
 return jsonb_build_object('status',next_status,'task_id',r.task_id);
end $$;
revoke all on function public.pvos_act_department_request(uuid,text,text) from public,anon;
grant execute on function public.pvos_act_department_request(uuid,text,text) to authenticated;

-- Linked department tasks can only be completed by the controlled department workflow.
create or replace function public.pvos_guard_department_completion() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('complete','cancelled') and new.status<>old.status
  and exists(select 1 from public.pvos_department_requests r where r.task_id=old.id and
    (r.status<>'complete' and new.status='complete' or r.status<>'cancelled' and new.status='cancelled')) then
   raise exception 'Use departmental workflow to close or cancel this request';
 end if;
 return new;
end $$;
create trigger pvos_guard_department_completion before update on public.pvos_tasks
 for each row execute function public.pvos_guard_department_completion();
