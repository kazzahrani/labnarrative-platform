-- All fixture data, simulated account actions and audit events are rolled back.
begin;
select set_config('test.org',gen_random_uuid()::text,true),set_config('test.company',gen_random_uuid()::text,true),set_config('test.task',gen_random_uuid()::text,true);
insert into public.pvos_organizations(id,name) values(current_setting('test.org')::uuid,'Task review fixture');
insert into public.pvos_memberships(organization_id,user_id,role) values
 (current_setting('test.org')::uuid,'621bdbb0-972a-4c70-83a3-a6e0df372d00','admin'),
 (current_setting('test.org')::uuid,'155986c8-294f-46ca-834e-17659760f171','deputy_qppv');
insert into public.pvos_companies(id,organization_id,name) values(current_setting('test.company')::uuid,current_setting('test.org')::uuid,'Review test company');
insert into public.pvos_tasks(id,organization_id,company_id,title,activity_type,status,owner_user_id) values(current_setting('test.task')::uuid,current_setting('test.org')::uuid,current_setting('test.company')::uuid,'Submitted task version 1','Training','in_progress','621bdbb0-972a-4c70-83a3-a6e0df372d00');
insert into public.pvos_task_evidence(task_id,title,evidence_type,seed_key) values(current_setting('test.task')::uuid,'Training attendance','note','review-fixture-evidence');
set local role authenticated;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
do $$begin
 begin perform public.pvos_send_task_review(current_setting('test.task')::uuid,auth.uid());raise exception 'TEST FAILURE self review';exception when others then if sqlerrm not like 'Choose another member%' then raise;end if;end;
 begin perform public.pvos_send_task_review(current_setting('test.task')::uuid,gen_random_uuid());raise exception 'TEST FAILURE external reviewer';exception when others then if sqlerrm not like 'Choose another member%' then raise;end if;end;
 begin update public.pvos_tasks set status='awaiting_review' where id=current_setting('test.task')::uuid;raise exception 'TEST FAILURE unassigned status';exception when others then if sqlerrm not like 'Choose a reviewer%' then raise;end if;end;
end$$;
select public.pvos_send_task_review(current_setting('test.task')::uuid,'155986c8-294f-46ca-834e-17659760f171','Please review evidence');
select public.pvos_send_task_review(current_setting('test.task')::uuid,'155986c8-294f-46ca-834e-17659760f171','Duplicate click');
-- An old login's seed replay is a true no-op even while review is pending.
insert into public.pvos_task_evidence(task_id,title,evidence_type,seed_key) values(current_setting('test.task')::uuid,'Must not overwrite submitted evidence','note','review-fixture-evidence') on conflict(task_id,seed_key) do nothing;
do $$declare r public.pvos_task_reviews%rowtype;begin
 select * into r from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid;
 if r.cycle<>1 or r.status<>'pending' or r.snapshot->'task'->>'title'<>'Submitted task version 1' or jsonb_array_length(r.snapshot->'evidence')<>1 or r.submission_note<>'Please review evidence' then raise exception 'TEST FAILURE submitted snapshot/idempotence';end if;
 if (select title from public.pvos_task_evidence where task_id=r.task_id and seed_key='review-fixture-evidence')<>'Training attendance' then raise exception 'TEST FAILURE login changed evidence';end if;
 begin perform public.pvos_decide_task_review(r.id,'approved');raise exception 'TEST FAILURE sender approved';exception when others then if sqlerrm not like 'Only the assigned reviewer%' then raise;end if;end;
 begin update public.pvos_tasks set status='complete' where id=r.task_id;raise exception 'TEST FAILURE complete bypass';exception when others then if sqlerrm not like 'Task is locked%' then raise;end if;end;
 begin update public.pvos_tasks set title='Changed during review' where id=r.task_id;raise exception 'TEST FAILURE task edit';exception when others then if sqlerrm not like 'Task is locked%' then raise;end if;end;
 begin insert into public.pvos_task_evidence(task_id,title,evidence_type) values(r.task_id,'Late evidence','note');raise exception 'TEST FAILURE evidence added';exception when others then if sqlerrm not like 'Submitted evidence%' then raise;end if;end;
 begin update public.pvos_task_reviews set status='approved' where id=r.id;raise exception 'TEST FAILURE forged decision';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','155986c8-294f-46ca-834e-17659760f171',true);
do $$begin
 begin perform public.pvos_decide_task_review((select id from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid),'returned',' ');raise exception 'TEST FAILURE missing reason';exception when others then if sqlerrm not like 'A return reason%' then raise;end if;end;
end$$;
select public.pvos_decide_task_review(id,'returned','Please correct attendance evidence') from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
update public.pvos_tasks set title='Corrected task version 2' where id=current_setting('test.task')::uuid;
insert into public.pvos_task_evidence(task_id,title,evidence_type) values(current_setting('test.task')::uuid,'Corrected attendance','note');
do $$begin
 begin update public.pvos_tasks set status='complete' where id=current_setting('test.task')::uuid;raise exception 'TEST FAILURE returned bypass';exception when others then if sqlerrm not like 'The assigned reviewer%' then raise;end if;end;
end$$;
select public.pvos_send_task_review(current_setting('test.task')::uuid,'155986c8-294f-46ca-834e-17659760f171','Correction submitted');
select set_config('request.jwt.claim.sub','155986c8-294f-46ca-834e-17659760f171',true);
-- Retry the previous return after resubmission must not alter the new pending cycle.
select public.pvos_decide_task_review(id,'returned','Retry') from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid and cycle=1;
select public.pvos_decide_task_review(id,'approved','Evidence reviewed') from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid and cycle=2;
select public.pvos_decide_task_review(id,'approved','Duplicate approve') from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid and cycle=2;
do $$begin
 if (select count(*) from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid)<>2 then raise exception 'TEST FAILURE cycle history';end if;
 if not exists(select 1 from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid and cycle=1 and status='returned' and snapshot->'task'->>'title'='Submitted task version 1' and decision_note='Please correct attendance evidence') then raise exception 'TEST FAILURE overwritten previous cycle';end if;
 if not exists(select 1 from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid and cycle=2 and status='approved' and decided_by=auth.uid() and decided_email='azzahranikhaledali@gmail.com' and decided_at is not null and jsonb_array_length(snapshot->'evidence')=2) then raise exception 'TEST FAILURE decision attribution';end if;
 if (select status from public.pvos_tasks where id=current_setting('test.task')::uuid)<>'complete' then raise exception 'TEST FAILURE completion';end if;
 if (select count(*) from public.pvos_audit_events where organization_id=current_setting('test.org')::uuid and entity_type='task_review')<>4 then raise exception 'TEST FAILURE duplicate audit decisions';end if;
end$$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$begin
 if exists(select 1 from public.pvos_task_reviews where task_id=current_setting('test.task')::uuid) then raise exception 'TEST FAILURE tenant isolation';end if;
 begin perform public.pvos_send_task_review(current_setting('test.task')::uuid,'155986c8-294f-46ca-834e-17659760f171');raise exception 'TEST FAILURE cross tenant RPC';exception when others then if sqlerrm not like 'Task not accessible%' then raise;end if;end;
end$$;
select 'PASS: assignment, stable snapshots, return/correct/resubmit/approve, actor/time, idempotence, direct-write guards, audit and tenant isolation' as result;
rollback;
