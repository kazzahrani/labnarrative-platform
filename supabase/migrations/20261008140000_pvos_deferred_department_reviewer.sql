-- Draft requests can start before the second reviewer has accepted membership.
-- Final signoff remains blocked until an independent member is assigned.
alter table public.pvos_department_requests alter column reviewer_user_id drop not null;

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
 if p_reviewer_user_id is not null and (p_reviewer_user_id=auth.uid() or not exists(
  select 1 from public.pvos_memberships where organization_id=c.organization_id and user_id=p_reviewer_user_id
 )) then raise exception 'Choose another workspace member as reviewer'; end if;
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

create or replace function public.pvos_assign_department_reviewer(p_request_id uuid,p_reviewer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pvos_department_requests%rowtype; v_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.pvos_department_requests where id=p_request_id for update;
 if not found or not public.pvos_is_member(r.organization_id) then raise exception 'Request unavailable'; end if;
 select role into v_role from public.pvos_memberships where organization_id=r.organization_id and user_id=auth.uid();
 if auth.uid()<>r.requester_user_id and v_role not in ('admin','qppv','deputy_qppv') then
  raise exception 'Only requester or PV lead may assign review'; end if;
 if r.status in ('complete','cancelled') then raise exception 'Cannot change final reviewer'; end if;
 if p_reviewer_id is null or p_reviewer_id=r.requester_user_id or not exists(
  select 1 from public.pvos_memberships where organization_id=r.organization_id and user_id=p_reviewer_id
 ) then raise exception 'Reviewer must be another workspace member'; end if;
 update public.pvos_department_requests set reviewer_user_id=p_reviewer_id where id=r.id;
 update public.pvos_tasks set reviewer_user_id=p_reviewer_id where id=r.task_id;
 insert into public.pvos_audit_events(organization_id,company_id,actor_user_id,entity_type,entity_id,event_type,after_data)
 values(r.organization_id,r.company_id,auth.uid(),'department_request',r.id,'reviewer_assigned',
  jsonb_build_object('reviewer_user_id',p_reviewer_id,'task_id',r.task_id));
 return jsonb_build_object('reviewer_user_id',p_reviewer_id);
end $$;
revoke all on function public.pvos_assign_department_reviewer(uuid,uuid) from public,anon;
grant execute on function public.pvos_assign_department_reviewer(uuid,uuid) to authenticated;
