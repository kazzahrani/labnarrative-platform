-- PVOS departmental review hardening: explicit document version, durable return feedback.
alter table public.pvos_department_requests
 add column if not exists last_returned_at timestamptz,
 add column if not exists last_return_reason text,
 add column if not exists approved_evidence_id uuid references public.pvos_task_evidence(id) on delete set null;

-- Preserve existing return reasons and the audit history.
update public.pvos_department_requests r set
 last_returned_at=(select max(a.created_at) from public.pvos_audit_events a
   where a.entity_type='department_request' and a.entity_id=r.id and a.event_type='return'),
 last_return_reason=(select nullif(a.metadata->>'note','') from public.pvos_audit_events a
   where a.entity_type='department_request' and a.entity_id=r.id and a.event_type='return'
   order by a.created_at desc limit 1)
where exists(select 1 from public.pvos_audit_events a where a.entity_type='department_request' and a.entity_id=r.id and a.event_type='return');

create or replace function public.pvos_act_department_request(p_request_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_department_requests%rowtype; next_status text; v_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.pvos_department_requests where id=p_request_id for update;
 if not found or not public.pvos_is_member(r.organization_id) then raise exception 'Request unavailable'; end if;
 select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
 if p_action='approve' then raise exception 'Choose an explicit evidence version using the review action'; end if;
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

 elsif (r.status in ('draft','waiting') and p_action='cancel') then next_status:='cancelled';
 else raise exception 'Invalid workflow transition'; end if;
 if p_action='mark_received' and auth.uid()<>r.requester_user_id
    and (r.recipient_user_id is null or auth.uid()<>r.recipient_user_id)
    and auth.uid()<>r.reviewer_user_id and v_role not in ('admin','qppv','deputy_qppv') then
     raise exception 'Not authorised to log receipt'; end if;
 if p_action in ('mark_requested','resend','cancel') and auth.uid()<>r.requester_user_id
    and v_role not in ('admin','qppv','deputy_qppv') then raise exception 'Only requester or PV lead may change the request'; end if;
 if p_action='return' and (r.reviewer_user_id is null or auth.uid()<>r.reviewer_user_id) then
   raise exception 'Assign an independent reviewer before making a review decision'; end if;
 if p_action in ('mark_received','return') and length(trim(coalesce(p_note,'')))<4 then raise exception 'Provide a receipt/return note'; end if;
 update public.pvos_department_requests set status=next_status,
  requested_at=case when p_action='mark_requested' then now() else requested_at end,
  received_at=case when p_action='mark_received' then now() else received_at end,
  completed_at=case when p_action='approve' then now() else completed_at end,
  response_note=case when p_action='mark_received' then p_note else response_note end,
  decision_note=case when p_action='return' then p_note else decision_note end,
  last_returned_at=case when p_action='return' then now() else last_returned_at end,
  last_return_reason=case when p_action='return' then p_note else last_return_reason end
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

-- Review decisions name the exact file/note being approved; old 3-argument RPC
-- deliberately cannot approve, preventing a legacy client from bypassing the evidence rule.
create or replace function public.pvos_approve_department_request(
 p_request_id uuid,p_evidence_id uuid,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_department_requests%rowtype; e public.pvos_task_evidence%rowtype; v_latest uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.pvos_department_requests where id=p_request_id for update;
 if not found or not public.pvos_is_member(r.organization_id) then raise exception 'Request unavailable'; end if;
 if r.status<>'received' then raise exception 'The request is not in evidence review'; end if;
 if r.reviewer_user_id is null or auth.uid()<>r.reviewer_user_id or auth.uid()=r.requester_user_id then
  raise exception 'Only the independently assigned reviewer may approve'; end if;
 if p_evidence_id is null then raise exception 'Select the evidence version you reviewed'; end if;
 select * into e from public.pvos_task_evidence where id=p_evidence_id and task_id=r.task_id and archived_at is null;
 if not found then raise exception 'Selected evidence is missing, archived, or belongs to another request'; end if;
 if r.request_type in ('invoice','document','labelling')
   and e.file_path is null and e.external_url is null then
  raise exception 'Select a document attachment for this type of request'; end if;
 if r.last_returned_at is not null and e.created_at<=r.last_returned_at then
  raise exception 'The submitted evidence predates the latest rejection; attach a corrected version'; end if;
 select ev.id into v_latest from public.pvos_task_evidence ev
  where ev.task_id=r.task_id and ev.archived_at is null
    and (r.request_type not in ('invoice','document','labelling') or ev.file_path is not null or ev.external_url is not null)
  order by ev.created_at desc,ev.id desc limit 1;
 if v_latest is distinct from e.id then
  raise exception 'A newer version is attached. Review and select the latest evidence first'; end if;
 update public.pvos_department_requests set
  status='complete', completed_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),''),approved_evidence_id=e.id
 where id=r.id;
 update public.pvos_tasks set status='complete',completed_at=now() where id=r.task_id;
 insert into public.pvos_audit_events(
  organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data,metadata
 ) values (
  r.organization_id,r.company_id,auth.uid(),'department_request',r.id,'approve',
  jsonb_build_object('status',r.status),
  jsonb_build_object('status','complete'),
  jsonb_build_object('note',coalesce(p_note,''),'task_id',r.task_id,
    'approved_evidence_id',e.id,'approved_evidence_title',e.title,'evidence_created_at',e.created_at)
 );
 return jsonb_build_object('status','complete','task_id',r.task_id,'approved_evidence_id',e.id);
end $$;
revoke all on function public.pvos_approve_department_request(uuid,uuid,text) from public,anon;
grant execute on function public.pvos_approve_department_request(uuid,uuid,text) to authenticated;
