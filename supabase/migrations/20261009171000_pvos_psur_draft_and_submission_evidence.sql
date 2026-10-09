-- Track the exact draft reviewed, separately from final submission evidence.
alter table public.pvos_psur_records
 add column if not exists draft_evidence_id uuid references public.pvos_task_evidence(id);

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
  if p_evidence_id is null or not exists(
   select 1 from public.pvos_task_evidence e where e.id=p_evidence_id and e.task_id=r.task_id
    and e.archived_at is null and e.file_path is not null
  ) then raise exception 'Select the uploaded PSUR draft document for the independent review';end if;
  update public.pvos_psur_records set reviewer_user_id=p_reviewer,draft_evidence_id=p_evidence_id,
   updated_at=clock_timestamp() where id=r.id;
  v_review:=public.pvos_send_task_review(r.task_id,p_reviewer,'PSUR draft for independent review');
 elsif p_action='submitted' and r.stage='approved' then
  if p_evidence_id is null or p_date is null or nullif(btrim(coalesce(p_reference,'')),'') is null then
   raise exception 'Submission date, reference and documentary proof are required';end if;
  if p_evidence_id=r.draft_evidence_id then
   raise exception 'Submission proof must be a different document from the reviewed draft';end if;
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


-- Even a direct Task → Review call must be initiated with a selected PSUR
-- draft document through the lifecycle workflow, never an unspecified file.
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
  if r.draft_evidence_id is null or not exists(
   select 1 from public.pvos_task_evidence e where e.id=r.draft_evidence_id
    and e.task_id=r.task_id and e.archived_at is null and e.file_path is not null
  ) then raise exception 'Select the uploaded PSUR draft document in PSUR before sending for review';end if;
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
