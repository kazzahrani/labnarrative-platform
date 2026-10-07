-- Run after the migration. All fixtures and generated evidence are rolled back.
begin;
select set_config('test.org',gen_random_uuid()::text,true),set_config('test.company1',gen_random_uuid()::text,true),set_config('test.company2',gen_random_uuid()::text,true);
insert into public.pvos_organizations(id,name) values(current_setting('test.org')::uuid,'Handover regression fixture');
insert into public.pvos_memberships(organization_id,user_id,role) values
  (current_setting('test.org')::uuid,'621bdbb0-972a-4c70-83a3-a6e0df372d00','qppv'),
  (current_setting('test.org')::uuid,'155986c8-294f-46ca-834e-17659760f171','deputy_qppv');
insert into public.pvos_companies(id,organization_id,name) values
  (current_setting('test.company1')::uuid,current_setting('test.org')::uuid,'Company A'),
  (current_setting('test.company2')::uuid,current_setting('test.org')::uuid,'Company B');
insert into public.pvos_tasks(organization_id,company_id,title,activity_type,due_at)
  select current_setting('test.org')::uuid,current_setting('test.company1')::uuid,'Frozen task '||i,'psur',now()+interval '2 days' from generate_series(1,1001)i;
insert into public.pvos_tasks(organization_id,company_id,title,activity_type) values
  (current_setting('test.org')::uuid,current_setting('test.company2')::uuid,'No deadline task','signal');
set local role authenticated;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
do $$begin
  begin
    perform public.pvos_create_handover(current_setting('test.org')::uuid,auth.uid(),current_date,current_date+7);
    raise exception 'TEST FAILURE: self-assignment accepted';
  exception when others then if sqlerrm not like 'Choose a different%' then raise; end if; end;
end$$;
select set_config('test.handover',public.pvos_create_handover(current_setting('test.org')::uuid,'155986c8-294f-46ca-834e-17659760f171',current_date,current_date+7)::text,true);
do $$begin
  if (select sum(jsonb_array_length(snapshot->'tasks')) from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid)<>1002 then raise exception 'TEST FAILURE: workload truncated'; end if;
  begin
    perform public.pvos_acknowledge_handover_company(current_setting('test.handover')::uuid,(select id from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid limit 1));
    raise exception 'TEST FAILURE: sender acknowledged';
  exception when others then if sqlerrm not like 'Only the assigned Deputy%' then raise; end if; end;
  begin
    update public.pvos_handover_companies set deputy_acknowledged_at=now() where handover_id=current_setting('test.handover')::uuid;
    raise exception 'TEST FAILURE: direct client acknowledgement accepted';
  exception when others then if sqlerrm not like 'Use the authorized%' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','155986c8-294f-46ca-834e-17659760f171',true);
select public.pvos_acknowledge_handover_company(current_setting('test.handover')::uuid,id) from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid and company_id=current_setting('test.company1')::uuid;
do $$begin
  if exists(select 1 from public.pvos_handover_evidence where handover_id=current_setting('test.handover')::uuid) then raise exception 'TEST FAILURE: partial evidence published'; end if;
end$$;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
do $$begin
  begin
    perform public.pvos_advance_handover(current_setting('test.handover')::uuid);
    raise exception 'TEST FAILURE: incomplete handover advanced';
  exception when others then if sqlerrm not like 'Required acknowledgements%' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','155986c8-294f-46ca-834e-17659760f171',true);
select public.pvos_acknowledge_handover_company(current_setting('test.handover')::uuid,id) from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid and company_id=current_setting('test.company2')::uuid;
-- Retry is idempotent: one evidence record, unchanged acknowledgement times.
select public.pvos_acknowledge_handover_company(current_setting('test.handover')::uuid,id) from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid;
do $$begin
  if (select count(*) from public.pvos_handover_evidence where handover_id=current_setting('test.handover')::uuid)<>1 then raise exception 'TEST FAILURE: evidence missing or duplicated'; end if;
  if exists(select 1 from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid and deputy_acknowledged_by is distinct from auth.uid()) then raise exception 'TEST FAILURE: attribution missing'; end if;
end$$;
select set_config('test.hash',(select snapshot_sha256 from public.pvos_handover_evidence where handover_id=current_setting('test.handover')::uuid),true);
-- An authenticated outsider has no workspace membership.
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$begin
  if exists(select 1 from public.pvos_handover_evidence where handover_id=current_setting('test.handover')::uuid) then raise exception 'TEST FAILURE: cross-tenant evidence leaked'; end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
update public.pvos_tasks set title='Changed live task' where company_id=current_setting('test.company1')::uuid;
do $$begin
  begin
    update public.pvos_handover_evidence set snapshot='{}' where handover_id=current_setting('test.handover')::uuid;
    raise exception 'TEST FAILURE: immutable evidence edited';
  exception when others then if sqlerrm<>'Handover evidence is immutable' then raise; end if; end;
  if exists(select 1 from public.pvos_handover_evidence where handover_id=current_setting('test.handover')::uuid and snapshot::text like '%Changed live task%') then raise exception 'TEST FAILURE: live task replaced frozen evidence'; end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','621bdbb0-972a-4c70-83a3-a6e0df372d00',true);
select public.pvos_advance_handover(current_setting('test.handover')::uuid);
select public.pvos_advance_handover(current_setting('test.handover')::uuid);
select public.pvos_acknowledge_handover_company(current_setting('test.handover')::uuid,id,true) from public.pvos_handover_companies where handover_id=current_setting('test.handover')::uuid;
select public.pvos_advance_handover(current_setting('test.handover')::uuid);
do $$begin
  if (select snapshot_sha256 from public.pvos_handover_evidence where handover_id=current_setting('test.handover')::uuid)<>current_setting('test.hash') then raise exception 'TEST FAILURE: handback changed original evidence'; end if;
end$$;
select 'PASS: independent accounts, 1002 tasks, partial gating, direct-write guards, idempotence, tenant isolation, immutable evidence and handback' as result;
rollback;
