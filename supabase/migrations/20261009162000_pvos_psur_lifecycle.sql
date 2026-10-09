-- Milestone B: PSUR lifecycle, anchored to immutable confirmed EURD applicability cycles.
-- Reuses existing tasks, evidence, named review, Requests and audit events.
create table if not exists public.pvos_psur_records(
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null unique references public.pvos_psur_cycles(id) on delete cascade,
 organization_id uuid not null references public.pvos_organizations(id),
 company_id uuid not null references public.pvos_companies(id),
 product_id uuid not null references public.pvos_products(id),
 task_id uuid not null unique references public.pvos_tasks(id),
 stage text not null default 'planning' check(stage in ('planning','inputs','draft','review','approved','submitted','complete')),
 owner_user_id uuid references auth.users(id),
 reviewer_user_id uuid references auth.users(id),
 submission_date date,
 submission_reference text,
 submission_evidence_id uuid references public.pvos_task_evidence(id),
 acknowledgement_evidence_id uuid references public.pvos_task_evidence(id),
 completed_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists pvos_psur_records_company on public.pvos_psur_records(company_id,stage);
alter table public.pvos_psur_records enable row level security;
revoke all on public.pvos_psur_records from public,anon,authenticated;
grant select on public.pvos_psur_records to authenticated;
create policy pvos_psur_records_read on public.pvos_psur_records
 for select to authenticated using (public.pvos_is_member(organization_id));

create table if not exists public.pvos_psur_inputs(
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.pvos_psur_records(id) on delete cascade,
 kind text not null check(kind in ('literature','signal','rmp','sales_exposure','medical','regulatory','other')),
 label text not null check(length(btrim(label)) between 2 and 220),
 owner_user_id uuid references auth.users(id),
 due_on date,
 request_id uuid references public.pvos_department_requests(id),
 source_task_id uuid references public.pvos_tasks(id),
 status text not null default 'waiting' check(status in ('waiting','received','complete')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index if not exists pvos_psur_inputs_record on public.pvos_psur_inputs(record_id);
alter table public.pvos_psur_inputs enable row level security;
revoke all on public.pvos_psur_inputs from public,anon,authenticated;
grant select on public.pvos_psur_inputs to authenticated;
create policy pvos_psur_inputs_read on public.pvos_psur_inputs
 for select to authenticated using(
 exists(select 1 from public.pvos_psur_records r where r.id=record_id
  and public.pvos_is_member(r.organization_id))
);

create or replace function public.pvos_psur_record_audit()
returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid;oid uuid;cid uuid;event text;
begin
 if tg_op='INSERT' then
  rid:=new.id;oid:=new.organization_id;cid:=new.company_id;event:='created';
 elsif tg_op='UPDATE' then
  rid:=new.id;oid:=new.organization_id;cid:=new.company_id;event:='updated';
 else return old;end if;
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data)
 values(oid,cid,auth.uid(),'psur_record',rid,event,
  case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create trigger pvos_psur_record_audit after insert or update on public.pvos_psur_records
 for each row execute function public.pvos_psur_record_audit();

create or replace function public.pvos_psur_input_audit()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.pvos_psur_records%rowtype;
begin
 select * into r from public.pvos_psur_records where id=new.record_id;
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata)
 values(r.organization_id,r.company_id,auth.uid(),'psur_input',new.id,
  case when tg_op='INSERT' then 'created' else 'updated' end,
  case when tg_op='UPDATE' then to_jsonb(old) else null end,
  to_jsonb(new),jsonb_build_object('psur_record_id',r.id));
 return new;
end $$;
create trigger pvos_psur_input_audit after insert or update on public.pvos_psur_inputs
 for each row execute function public.pvos_psur_input_audit();

-- Exactly one operational record per regulatory-confirmed cycle. Projections remain drafts.
create or replace function public.pvos_psur_create_record()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='confirmed' and new.task_id is not null and
    (tg_op='INSERT' or old.status is distinct from 'confirmed') then
   insert into public.pvos_psur_records(
      cycle_id,organization_id,company_id,product_id,task_id,owner_user_id,reviewer_user_id)
   select new.id,new.organization_id,new.company_id,new.product_id,new.task_id,
     t.owner_user_id,t.reviewer_user_id from public.pvos_tasks t where t.id=new.task_id
   on conflict(cycle_id) do nothing;
 end if;
 return new;
end $$;
create trigger pvos_psur_create_record after insert or update of status on public.pvos_psur_cycles
 for each row execute function public.pvos_psur_create_record();
insert into public.pvos_psur_records(cycle_id,organization_id,company_id,product_id,task_id,owner_user_id,reviewer_user_id)
select c.id,c.organization_id,c.company_id,c.product_id,c.task_id,t.owner_user_id,t.reviewer_user_id
from public.pvos_psur_cycles c join public.pvos_tasks t on t.id=c.task_id
where c.status='confirmed' and c.task_id is not null
on conflict(cycle_id) do nothing;

-- Only a regulatorily confirmed record can progress. Inputs may refer to a
-- departmental request or to another task, but must belong to the same company.
create or replace function public.pvos_psur_save_input(
 p_record_id uuid,p_id uuid,p_kind text,p_label text,p_owner uuid default null,
 p_due date default null,p_request uuid default null,p_source_task uuid default null,p_status text default 'waiting')
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.pvos_psur_records%rowtype;v_id uuid;
begin
 select * into r from public.pvos_psur_records where id=p_record_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(r.organization_id) then raise exception 'PSUR unavailable';end if;
 if r.stage not in ('planning','inputs','draft') then raise exception 'Inputs are locked during and after review';end if;
 if p_kind not in ('literature','signal','rmp','sales_exposure','medical','regulatory','other') or length(btrim(coalesce(p_label,''))) not between 2 and 220
    or p_status not in ('waiting','received','complete') then raise exception 'Invalid input';end if;
 if p_owner is not null and not exists(select 1 from public.pvos_memberships m where m.user_id=p_owner and m.organization_id=r.organization_id) then
  raise exception 'Owner must belong to this workspace';end if;
 if p_request is not null and not exists(select 1 from public.pvos_department_requests d where d.id=p_request and d.company_id=r.company_id and (d.product_id is null or d.product_id=r.product_id)) then
  raise exception 'Select a request from the same company/product';end if;
 if p_source_task is not null and not exists(select 1 from public.pvos_tasks t where t.id=p_source_task and t.company_id=r.company_id and (t.product_id is null or t.product_id=r.product_id)) then
  raise exception 'Source work must belong to this company/product';end if;
 if p_id is null then
  insert into public.pvos_psur_inputs(record_id,kind,label,owner_user_id,due_on,request_id,source_task_id,status)
  values(r.id,p_kind,btrim(p_label),p_owner,p_due,p_request,p_source_task,p_status) returning id into v_id;
 else
  update public.pvos_psur_inputs set kind=p_kind,label=btrim(p_label),owner_user_id=p_owner,due_on=p_due,
    request_id=p_request,source_task_id=p_source_task,status=p_status,updated_at=clock_timestamp()
  where id=p_id and record_id=r.id returning id into v_id;
  if v_id is null then raise exception 'PSUR input not found';end if;
 end if;
 return v_id;
end $$;

-- Existing named-review snapshot and evidence locking, with PSUR-specific
-- prerequisite: a draft document must be attached before independent review.
create or replace function public.pvos_psur_review_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.pvos_psur_records%rowtype;
begin
 if tg_op='INSERT' then
  select * into r from public.pvos_psur_records where task_id=new.task_id for update;
  if not found then return new;end if;
  if r.stage<>'draft' then raise exception 'PSUR must reach Draft before review';end if;
  if r.reviewer_user_id is not null and r.reviewer_user_id<>new.assigned_to then
   raise exception 'Choose the named PSUR reviewer';end if;
  if not exists(select 1 from public.pvos_task_evidence e where e.task_id=r.task_id and e.archived_at is null and e.file_path is not null)
    then raise exception 'Upload the PSUR draft document before sending for review';end if;
  update public.pvos_psur_records set stage='review',reviewer_user_id=new.assigned_to,updated_at=clock_timestamp() where id=r.id;
 elsif tg_op='UPDATE' and old.status='pending' and new.status in ('approved','returned') then
  select * into r from public.pvos_psur_records where task_id=new.task_id for update;
  if found then
   update public.pvos_psur_records set stage=case when new.status='approved' then 'approved' else 'draft' end,
    updated_at=clock_timestamp() where id=r.id and stage='review';
  end if;
 end if;
 return new;
end $$;
create trigger pvos_psur_review_guard before insert or update of status on public.pvos_task_reviews
 for each row execute function public.pvos_psur_review_guard();

-- A PSUR operational task is NOT complete merely because the draft was approved.
create or replace function public.pvos_guard_psur_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.pvos_psur_records%rowtype;
begin
 if new.status='complete' and old.status is distinct from 'complete' then
  select * into r from public.pvos_psur_records where task_id=new.id;
  if found and r.stage<>'complete' then
    raise exception 'PSUR completion requires submission evidence and lifecycle completion';
  end if;
 end if;
 return new;
end $$;
create trigger pvos_guard_psur_completion before update of status on public.pvos_tasks
 for each row execute function public.pvos_guard_psur_completion();

-- Change only the terminal status behavior for PSUR task reviews. All existing
-- non-PSUR review behavior remains the same.
create or replace function public.pvos_decide_task_review(p_review_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_task_reviews%rowtype;t public.pvos_tasks%rowtype;v_email text;v_role text;v_psur boolean;
begin
 select * into r from public.pvos_task_reviews where id=p_review_id;
 if not found then raise exception 'Review not accessible';end if;
 select * into t from public.pvos_tasks where id=r.task_id for update;
 if not found or auth.uid() is null or not public.pvos_is_member(r.organization_id) then raise exception 'Review not accessible';end if;
 select * into r from public.pvos_task_reviews where id=p_review_id for update;
 if auth.uid()<>r.assigned_to then raise exception 'Only the assigned reviewer can approve or return';end if;
 if p_decision not in ('approved','returned') or p_decision is null then raise exception 'Choose Approve or Return';end if;
 if r.status=p_decision then return jsonb_build_object('task_id',t.id,'status',r.status,'already_decided',true);end if;
 if r.status<>'pending' or t.status<>'awaiting_review' then raise exception 'This review is no longer pending';end if;
 if p_decision='returned' and coalesce(length(trim(p_note)),0)=0 then raise exception 'A return reason is required';end if;
 if exists(select 1 from public.pvos_task_approvals where task_id=t.id) then raise exception 'A staged approval route conflicts with this review';end if;
 select exists(select 1 from public.pvos_psur_records where task_id=t.id) into v_psur;
 select email into v_email from auth.users where id=auth.uid();
 select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
 update public.pvos_task_reviews set status=p_decision,decided_by=auth.uid(),decided_email=v_email,decided_role=v_role,decided_at=now(),decision_note=nullif(trim(p_note),'') where id=r.id;
 update public.pvos_tasks set
  status=case when p_decision='approved' and not v_psur then 'complete' else 'in_progress' end,
  completed_at=case when p_decision='approved' and not v_psur then now() else null end
 where id=t.id;
 return jsonb_build_object('task_id',t.id,'status',p_decision,'already_decided',false);
end $$;

create or replace function public.pvos_psur_advance(
 p_record_id uuid,p_action text,p_reviewer uuid default null,
 p_evidence_id uuid default null,p_reference text default null,p_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_psur_records%rowtype;v_role text;v_review jsonb;v_evidence public.pvos_task_evidence%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into r from public.pvos_psur_records where id=p_record_id for update;
 if not found or not public.pvos_is_member(r.organization_id) then raise exception 'PSUR unavailable';end if;
 select m.role into v_role from public.pvos_memberships m where m.organization_id=r.organization_id and m.user_id=auth.uid();
 if auth.uid() is distinct from r.owner_user_id and v_role not in ('admin','qppv','deputy_qppv','manager') then
  raise exception 'Only the PSUR owner or PV lead can advance this record';end if;
 if p_action='start_inputs' and r.stage='planning' then
  update public.pvos_psur_records set stage='inputs',updated_at=clock_timestamp() where id=r.id;
 elsif p_action='draft' and r.stage='inputs' then
  update public.pvos_psur_records set stage='draft',updated_at=clock_timestamp() where id=r.id;
 elsif p_action='send_review' and r.stage='draft' then
  if p_reviewer is null or p_reviewer=auth.uid() or not exists(
   select 1 from public.pvos_memberships m where m.organization_id=r.organization_id and m.user_id=p_reviewer
  ) then raise exception 'Select a different workspace member as reviewer';end if;
  update public.pvos_psur_records set reviewer_user_id=p_reviewer,updated_at=clock_timestamp() where id=r.id;
  v_review:=public.pvos_send_task_review(r.task_id,p_reviewer,'PSUR draft for independent review');
 elsif p_action='submitted' and r.stage='approved' then
  if p_evidence_id is null or p_date is null or nullif(btrim(coalesce(p_reference,'')),'') is null then
   raise exception 'Submission date, reference and documentary proof are required';end if;
  select * into v_evidence from public.pvos_task_evidence where id=p_evidence_id and task_id=r.task_id
    and archived_at is null and file_path is not null;
  if not found then raise exception 'Submission proof must be an uploaded document for this PSUR';end if;
  update public.pvos_psur_records set stage='submitted',submission_date=p_date,
   submission_reference=btrim(p_reference),submission_evidence_id=p_evidence_id,updated_at=clock_timestamp()
   where id=r.id;
 elsif p_action='complete' and r.stage='submitted' then
  if p_evidence_id is not null and not exists(
   select 1 from public.pvos_task_evidence e where e.id=p_evidence_id
    and e.task_id=r.task_id and e.archived_at is null and e.file_path is not null
  ) then raise exception 'Acknowledgement must be an uploaded document for this PSUR';end if;
  update public.pvos_psur_records set stage='complete',acknowledgement_evidence_id=p_evidence_id,
   completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  update public.pvos_tasks set status='complete',completed_at=now() where id=r.task_id;
 else raise exception 'Invalid PSUR lifecycle transition';end if;
 return jsonb_build_object('stage',(select stage from public.pvos_psur_records where id=r.id),
  'review_id',v_review->>'review_id');
end $$;
revoke all on function public.pvos_psur_save_input(uuid,uuid,text,text,uuid,date,uuid,uuid,text),
 public.pvos_psur_advance(uuid,text,uuid,uuid,text,date) from public,anon;
grant execute on function public.pvos_psur_save_input(uuid,uuid,text,text,uuid,date,uuid,uuid,text),
 public.pvos_psur_advance(uuid,text,uuid,uuid,text,date) to authenticated;
