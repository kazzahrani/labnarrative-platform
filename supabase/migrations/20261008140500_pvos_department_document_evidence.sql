-- Invoices and controlled documents require an attached file or evidence URL before independent review.
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
 if p_action in ('approve','return') and (r.reviewer_user_id is null or auth.uid()<>r.reviewer_user_id) then
   raise exception 'Assign an independent reviewer before making a review decision'; end if;
 if p_action in ('mark_received','return') and length(trim(coalesce(p_note,'')))<4 then raise exception 'Provide a receipt/return note'; end if;
 if p_action='approve' and not exists(
  select 1 from public.pvos_task_evidence e
  where e.task_id=r.task_id and e.archived_at is null
    and (r.request_type not in ('invoice','document','labelling')
      or e.file_path is not null or e.external_url is not null)
 ) then
  raise exception 'Attach received evidence (a document is required for invoices, labelling and controlled documents) before approval'; end if;
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

