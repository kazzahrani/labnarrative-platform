-- Reproduces the sign-in seed that failed after the approval guard was added.
begin;
select set_config('test.original_approval',
  (select to_jsonb(a)::text from public.pvos_task_approvals a where task_id='bd47f7cd-c658-450a-ab15-3402ff404ae0' and seed_key='demo-rmp-step-1'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
select public.pvos_bootstrap_workspace('PVOS Demo Workspace');
-- Old cached browser code proposes these values even though all rows already exist.
insert into public.pvos_task_approvals(task_id,route_id,seed_key,step_position,assigned_user_id,status,completed_at) values
 ('bd47f7cd-c658-450a-ab15-3402ff404ae0','9830431c-fc54-43eb-b8da-5bc50200b9f8','demo-rmp-step-1',1,'621bdbb0-972a-4c70-83a3-a6e0df372d00','approved',now()),
 ('bd47f7cd-c658-450a-ab15-3402ff404ae0','9830431c-fc54-43eb-b8da-5bc50200b9f8','demo-rmp-step-2',2,null,'in_review',null),
 ('bd47f7cd-c658-450a-ab15-3402ff404ae0','9830431c-fc54-43eb-b8da-5bc50200b9f8','demo-rmp-step-3',3,null,'pending',null)
 on conflict(task_id,seed_key) do nothing;
do $$begin
 if (select to_jsonb(a)::text from public.pvos_task_approvals a where task_id='bd47f7cd-c658-450a-ab15-3402ff404ae0' and seed_key='demo-rmp-step-1')<>current_setting('test.original_approval') then
  raise exception 'TEST FAILURE: returning login altered an approval';
 end if;
 begin
  insert into public.pvos_task_approvals(task_id,step_position,seed_key,status,completed_at) values
   ('bd47f7cd-c658-450a-ab15-3402ff404ae0',99,'test-forged-new-decision','approved',now());
  raise exception 'TEST FAILURE: new fabricated decision accepted';
 exception when others then if sqlerrm not like 'New approval steps must start pending%' then raise; end if; end;
end$$;
reset role;
select set_config('test.org',gen_random_uuid()::text,true),set_config('test.company',gen_random_uuid()::text,true),set_config('test.task',gen_random_uuid()::text,true);
insert into public.pvos_organizations(id,name) values(current_setting('test.org')::uuid,'Fresh login seed fixture');
insert into public.pvos_memberships(organization_id,user_id,role) values(current_setting('test.org')::uuid,'621bdbb0-972a-4c70-83a3-a6e0df372d00','admin');
insert into public.pvos_companies(id,organization_id,name) values(current_setting('test.company')::uuid,current_setting('test.org')::uuid,'New demo company');
insert into public.pvos_tasks(id,organization_id,company_id,title,activity_type,status) values(current_setting('test.task')::uuid,current_setting('test.org')::uuid,current_setting('test.company')::uuid,'New demo RMP','RMP','awaiting_review');
set local role authenticated;
insert into public.pvos_task_approvals(task_id,seed_key,step_position,assigned_user_id,status) values
 (current_setting('test.task')::uuid,'demo-rmp-step-1',1,'621bdbb0-972a-4c70-83a3-a6e0df372d00','pending'),
 (current_setting('test.task')::uuid,'demo-rmp-step-2',2,null,'pending'),
 (current_setting('test.task')::uuid,'demo-rmp-step-3',3,null,'pending') on conflict(task_id,seed_key) do nothing;
select public.pvos_send_task_for_approval(current_setting('test.task')::uuid);
do $$begin
 if (select count(*) from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and status='in_review' and step_position=1)<>1 then raise exception 'TEST FAILURE: fresh demo first step not active'; end if;
 if exists(select 1 from public.pvos_task_approvals where task_id=current_setting('test.task')::uuid and (status='approved' or completed_by is not null)) then raise exception 'TEST FAILURE: fresh demo fabricated an approval'; end if;
end$$;
select 'PASS: old cached sign-in seed is a no-op, original decision preserved, forged new approval blocked, fresh demo starts in first human review' as result;
rollback;
