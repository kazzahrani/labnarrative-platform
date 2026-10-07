-- Fixtures use two existing test accounts; all data and decisions are rolled back.
begin;
select set_config('test.org',gen_random_uuid()::text,true),set_config('test.company',gen_random_uuid()::text,true),set_config('test.route',gen_random_uuid()::text,true),set_config('test.task',gen_random_uuid()::text,true);
insert into public.pvos_organizations(id,name) values(current_setting('test.org')::uuid,'Approval regression fixture');
insert into public.pvos_memberships(organization_id,user_id,role) values
 (current_setting('test.org')::uuid,'621bdbb0-972a-4c70-83a3-a6e0df372d00','admin'),
 (current_setting('test.org')::uuid,'155986c8-294f-46ca-834e-17659760f171','deputy_qppv');
insert into public.pvos_companies(id,organization_id,name) values(current_setting('test.company')::uuid,current_setting('test.org')::uuid,'Test company');
insert into public.pvos_approval_routes(id,company_id,name) values(current_setting('test.route')::uuid,current_setting('test.company')::uuid,'QPPV / Quality');
insert into public.pvos_approval_steps(route_id,position,role,assignee_user_id) values
 (current_setting('test.route')::uuid,1,'QPPV','621bdbb0-972a-4c70-83a3-a6e0df372d00'),
 (current_setting('test.route')::uuid,2,'Quality',null);
insert into public.pvos_tasks(id,organization_id,company_id,title,activity_type,status) values(current_setting('test.task')::uuid,current_setting('test.org')::uuid,current_setting('test.company')::uuid,'Approval fixture','RMP','in_progress');
insert into public.pvos_task_approvals(task_id,route_id,step_position,assigned_user_id) values
 (current_setting('test.task')::uuid,current_setting('test.route')::uuid,1,'621bdbb0-972a-4c70-83a3-a6e0df372d00'),
 (current_setting('test.task')::uuid,current_setting('test.route')::uuid,2,null);
set local role authenticated;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
do $$begin
 begin
  update public.pvos_tasks set status='complete' where id=current_setting('test.task')::uuid;
  raise exception 'TEST FAILURE: task bypassed approvals';
 exception when others then if sqlerrm not like 'Required approval steps%' then raise; end if; end;
 begin
  update public.pvos_task_approvals set status='approved' where task_id=current_setting('test.task')::uuid;
  raise exception 'TEST FAILURE: direct decision write succeeded';
 exception when others then if sqlerrm not like 'Use the authorized%' then raise; end if; end;
end$$;
select public.pvos_send_task_for_approval(current_setting('test.task')::uuid);
select set_config('request.jwt.claim.sub','155986c8-294f-46ca-834e-17659760f171',true);
do $$begin
 begin
  perform public.pvos_approve_task_step((select id from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=1));
  raise exception 'TEST FAILURE: wrong assigned reviewer approved';
 exception when others then if sqlerrm not like 'Only the assigned reviewer%' then raise; end if; end;
 begin
  perform public.pvos_approve_task_step((select id from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=2));
  raise exception 'TEST FAILURE: wrong role approved';
 exception when others then if sqlerrm not like 'This unassigned step%' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
do $$begin
 begin
  perform public.pvos_approve_task_step((select id from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=2));
  raise exception 'TEST FAILURE: future step approved';
 exception when others then if sqlerrm not like 'Only the current active%' then raise; end if; end;
end$$;
select public.pvos_approve_task_step(id,'Reviewed supporting evidence') from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=1;
-- Duplicate click is idempotent and does not advance again or change the decision time.
select public.pvos_approve_task_step(id) from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=1;
do $$begin
 if (select status from public.pvos_tasks where id=current_setting('test.task')::uuid)<>'awaiting_review' then raise exception 'TEST FAILURE: task completed before final step'; end if;
 if not exists(select 1 from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=2 and status='in_review') then raise exception 'TEST FAILURE: next step not activated'; end if;
 if not exists(select 1 from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=1 and completed_by=auth.uid() and decision_context->>'destination'='next_step') then raise exception 'TEST FAILURE: decision attribution or destination missing'; end if;
end$$;
select public.pvos_approve_task_step(id) from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and step_position=2;
do $$begin
 if (select status from public.pvos_tasks where id=current_setting('test.task')::uuid)<>'complete' then raise exception 'TEST FAILURE: final approval did not complete task'; end if;
 if (select count(*) from public.pvos_audit_events where organization_id=current_setting('test.org')::uuid and entity_type='approval' and event_type='update' and after_data->>'status'='approved' and before_data->>'status'<>'approved')<>2 then raise exception 'TEST FAILURE: duplicate or missing decision audit events'; end if;
end$$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$begin
 if exists(select 1 from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid) then raise exception 'TEST FAILURE: cross-tenant history visible'; end if;
end$$;
select 'PASS: role and assignment checks, step order, atomic handoff/completion, immutable decisions, idempotence and tenant isolation' as result;
rollback;
